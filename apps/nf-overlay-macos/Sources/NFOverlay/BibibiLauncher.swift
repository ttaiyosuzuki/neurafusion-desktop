// v6 [UX-01] ビビビ（体験モード）を開く口（Mac）。キー・画面の角の丸・音声のうち、
// ux-settings.json の "triggers" で本人が選んだものだけを動かし、押されたら端末内の画面（127.0.0.1）を既定のブラウザで開く。
// 設定ファイルが無ければ何もしない。検品の丸（DotPanel）と FF のキー（FfHotKeys）には触れない（別の署名 'NFBB'）。
// 音声は NSSpeechRecognizer の決まった言葉だけを聞く（文字起こしはしない・言葉は voice_phrase）。

import AppKit
import Carbon.HIToolbox
import NFOverlayCore

private let bibibiSignature: OSType = 0x4E46_4242 // 'NFBB'

final class BibibiMarkView: NSView {
    var onClick: (() -> Void)?
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func draw(_ dirtyRect: NSRect) {
        let r = bounds.insetBy(dx: 2, dy: 2)
        NSColor(calibratedRed: 0.42, green: 0.30, blue: 0.86, alpha: 0.92).setFill()
        NSBezierPath(ovalIn: r).fill()
        let s = NSAttributedString(string: "ビ", attributes: [
            .font: NSFont.boldSystemFont(ofSize: r.height * 0.45),
            .foregroundColor: NSColor.white,
        ])
        let sz = s.size()
        s.draw(at: NSPoint(x: r.midX - sz.width / 2, y: r.midY - sz.height / 2))
    }
    override func mouseUp(with event: NSEvent) {
        if bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
    }
}

@MainActor
final class BibibiLauncher: NSObject, NSSpeechRecognizerDelegate {
    private var config: BibibiLaunchConfig?
    private var hotKeyRef: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private var mark: NSPanel?
    private var speech: NSSpeechRecognizer?
    private var timer: Timer?
    private var lastStamp: Date?
    private let path = bibibiSettingsPath(env: ProcessInfo.processInfo.environment)

    func start() {
        reload()
        // 設定は ux の画面で変わる。10 秒ごとに更新日時だけ見て、変わったら読み直す
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.reloadIfChanged() }
        }
    }

    private func reloadIfChanged() {
        let stamp = (try? FileManager.default.attributesOfItem(atPath: path))?[.modificationDate] as? Date
        if stamp != lastStamp { reload() }
    }

    private func reload() {
        lastStamp = (try? FileManager.default.attributesOfItem(atPath: path))?[.modificationDate] as? Date
        let data = FileManager.default.contents(atPath: path)
        let next = data.flatMap { parseBibibiSettings($0, urlOverride: ProcessInfo.processInfo.environment["NF_BIBIBI_URL"]) }
        if next == config { return }
        config = next
        applyHotKey()
        applyMark()
        applyVoice()
    }

    private func open() {
        guard let url = config?.url else { return }
        NSWorkspace.shared.open(url)
    }

    // MARK: キー（Carbon・アクセシビリティの許可が要らない・ほかのキー入力は見ない）

    private func applyHotKey() {
        if let ref = hotKeyRef { UnregisterEventHotKey(ref); hotKeyRef = nil }
        guard let c = config, c.triggers.contains(.hotkey), let chord = c.chord, let hk = carbonHotKey(chord) else { return }
        if handler == nil {
            var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
            let me = Unmanaged.passUnretained(self).toOpaque()
            InstallEventHandler(GetApplicationEventTarget(), { _, event, user in
                guard let event, let user else { return OSStatus(eventNotHandledErr) }
                var id = EventHotKeyID()
                let st = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                                           nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
                guard st == noErr, id.signature == bibibiSignature else { return OSStatus(eventNotHandledErr) }
                let me = Unmanaged<BibibiLauncher>.fromOpaque(user).takeUnretainedValue()
                MainActor.assumeIsolated { me.open() }
                return noErr
            }, 1, &spec, me, &handler)
        }
        var ref: EventHotKeyRef?
        let st = RegisterEventHotKey(hk.keyCode, hk.modifiers, EventHotKeyID(signature: bibibiSignature, id: 1),
                                     GetApplicationEventTarget(), 0, &ref)
        if st == noErr { hotKeyRef = ref } else { FileHandle.standardError.write(Data("bibibi: hotkey busy\n".utf8)) }
    }

    // MARK: 画面の角の丸

    private func applyMark() {
        guard let c = config, c.triggers.contains(.mark), let screen = NSScreen.main else {
            mark?.orderOut(nil)
            return
        }
        let size = 30.0
        let v = screen.visibleFrame
        let f = bibibiMarkFrame(visible: Rect(x: v.minX, y: v.minY, w: v.width, h: v.height), size: size, corner: c.corner)
        let panel = mark ?? makeMarkPanel()
        mark = panel
        panel.setFrame(NSRect(x: f.x, y: f.y, width: f.w, height: f.h), display: true)
        panel.orderFrontRegardless()
    }

    private func makeMarkPanel() -> NSPanel {
        let p = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 30, height: 30),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        p.isOpaque = false
        p.backgroundColor = .clear
        p.hasShadow = false
        p.level = .floating
        p.hidesOnDeactivate = false
        p.isReleasedWhenClosed = false
        p.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        let v = BibibiMarkView()
        v.onClick = { [weak self] in self?.open() }
        v.toolTip = "ビビビ（知らなかった一手）を開く"
        v.setAccessibilityLabel("ビビビを開く")
        v.setAccessibilityRole(.button)
        p.contentView = v
        return p
    }

    // MARK: 音声（決まった言葉だけ）

    private func applyVoice() {
        speech?.stopListening()
        speech = nil
        guard let c = config, c.triggers.contains(.voice), let r = NSSpeechRecognizer() else { return }
        r.commands = [c.voicePhrase]
        r.listensInForegroundOnly = false
        r.blocksOtherRecognizers = false
        r.delegate = self
        r.startListening()
        speech = r
    }

    nonisolated func speechRecognizer(_ sender: NSSpeechRecognizer, didRecognizeCommand command: String) {
        MainActor.assumeIsolated { self.open() }
    }
}
