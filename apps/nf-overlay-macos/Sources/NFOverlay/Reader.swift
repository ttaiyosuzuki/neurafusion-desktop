// 押したときだけの読み取り（DK-02）。AX で読めるアプリはそこから、読めないアプリは
// 本人にその都度聞いてから、そのウィンドウ1つだけを撮って Vision で端末内の文字認識をする。
// 画面収録・アクセシビリティの許可のダイアログは出さない（Preflight で有無を見るだけ）。

import AppKit
import ApplicationServices
import NFOverlayCore
import ScreenCaptureKit
import Vision

enum AxTextReader {
    private static let textRoles: Set<String> = [
        "AXStaticText", "AXTextArea", "AXTextField", "AXHeading", "AXCell", "AXLink", "AXListItem",
    ]

    /// ウィンドウの AX の木から見えている文字を集める（深さ・件数・時間に上限）。
    static func read(window: AXUIElement, pid: pid_t) -> AxOutcome {
        guard AXIsProcessTrusted() else { return AxOutcome(permitted: false, text: "") }
        // Electron 製のアプリ（Claude・Cursor など）は、AX の木をこれで出す。押したときだけ設定する。
        let app = AXUIElementCreateApplication(pid)
        AXUIElementSetAttributeValue(app, "AXManualAccessibility" as CFString, kCFBooleanTrue)

        var frags: [String] = []
        var total = 0
        var visited = 0
        let deadline = Date().addingTimeInterval(1.5)
        var stack: [(AXUIElement, Int)] = [(window, 0)]
        while let (el, depth) = stack.popLast() {
            visited += 1
            if visited > 20000 || depth > 80 || Date() > deadline || total >= overlayTextLimit { break }
            let role = string(el, kAXRoleAttribute) ?? ""
            if textRoles.contains(role) {
                for a in [kAXValueAttribute, kAXTitleAttribute, kAXDescriptionAttribute] {
                    if let s = string(el, a), !s.isEmpty { frags.append(s); total += s.count; break }
                }
            }
            var kids: CFTypeRef?
            if AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &kids) == .success,
               let arr = kids as? [AXUIElement] {
                // 画面の上から順に読めるよう、逆順に積む
                for k in arr.reversed() { stack.append((k, depth + 1)) }
            }
        }
        return AxOutcome(permitted: true, text: joinAxFragments(frags))
    }

    private static func string(_ el: AXUIElement, _ attr: String) -> String? {
        var v: CFTypeRef?
        guard AXUIElementCopyAttributeValue(el, attr as CFString, &v) == .success else { return nil }
        return v as? String
    }
}

enum OcrReader {
    static var screenPermitted: Bool { CGPreflightScreenCaptureAccess() }

    /// そのアプリの、この位置・大きさのウィンドウ1つだけを撮って文字を読む。
    static func read(pid: pid_t, frame: Rect) async -> String {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
            let mine = content.windows.filter { $0.owningApplication?.processID == pid && $0.windowLayer == 0 }
            // AX の枠（左上原点）と SCWindow.frame（左上原点・ポイント）が一番近いもの
            guard let win = mine.min(by: { dist($0.frame, frame) < dist($1.frame, frame) }) else { return "" }
            let filter = SCContentFilter(desktopIndependentWindow: win)
            let conf = SCStreamConfiguration()
            let scale = Double(filter.pointPixelScale)
            conf.width = Int(win.frame.width * scale)
            conf.height = Int(win.frame.height * scale)
            conf.showsCursor = false
            let image = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: conf)
            return try recognize(image)
        } catch {
            return ""
        }
    }

    private static func dist(_ a: CGRect, _ b: Rect) -> Double {
        abs(a.minX - b.x) + abs(a.minY - b.y) + abs(a.width - b.w) + abs(a.height - b.h)
    }

    /// Vision の文字認識（端末内）。上から下・左から右の順に並べる。
    static func recognize(_ image: CGImage) throws -> String {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.usesLanguageCorrection = true
        req.recognitionLanguages = ["ja-JP", "en-US"]
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([req])
        let obs = (req.results ?? []).sorted {
            let dy = $0.boundingBox.midY - $1.boundingBox.midY
            if abs(dy) > 0.01 { return dy > 0 } // Vision は左下原点
            return $0.boundingBox.minX < $1.boundingBox.minX
        }
        return obs.compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    }
}

enum OcrConsent {
    /// 画面を撮る前に毎回聞く（指示書 §8-3）。
    @MainActor
    static func ask(appLabel: String) -> Bool {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "\(appLabel) のウィンドウを撮って文字を読みますか？"
        alert.informativeText = "このアプリは画面の文字を直接読めませんでした。今回だけ、このウィンドウ1つを撮影し、この Mac の中で文字を読み取ります。画像は保存・送信しません。"
        alert.addButton(withTitle: "今回だけ撮る")
        alert.addButton(withTitle: "撮らない")
        alert.alertStyle = .informational
        return alert.runModal() == .alertFirstButtonReturn
    }
}
