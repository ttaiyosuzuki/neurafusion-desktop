// 前面のアプリとそのウィンドウの位置・大きさを追う（DK-01）。
// 受け取るのは位置・大きさ・前面のウィンドウの切り替わりの AX 通知だけ。本文（AXValue 等）はここでは読まない。

import AppKit
import ApplicationServices
import NFOverlayCore

final class WindowTracker {
    /// 前面のアプリが変わった（bundle id, pid）
    var onFrontApp: ((String?, pid_t) -> Void)?
    /// ウィンドウの位置・大きさ（左上原点・ポイント。nil はウィンドウ無し）
    var onWindow: ((Rect?) -> Void)?

    private(set) var pid: pid_t = 0
    private var observer: AXObserver?
    private var appElement: AXUIElement?
    private var windowElement: AXUIElement?
    private var activationToken: NSObjectProtocol?

    func start() {
        activationToken = NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main
        ) { [weak self] note in
            guard let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
            self?.frontChanged(app)
        }
        if let app = NSWorkspace.shared.frontmostApplication { frontChanged(app) }
    }

    private func frontChanged(_ app: NSRunningApplication) {
        // 自分（同意の確認・パネル）が前に出たときは丸をそのままにする
        if app.processIdentifier == getpid() { return }
        onFrontApp?(app.bundleIdentifier, app.processIdentifier)
    }

    func watch(pid newPid: pid_t) {
        if newPid == pid, observer != nil { refresh(); return }
        unwatch()
        pid = newPid
        guard AXIsProcessTrusted() else { onWindow?(nil); return }
        let app = AXUIElementCreateApplication(pid)
        appElement = app
        var obs: AXObserver?
        let cb: AXObserverCallback = { _, _, _, refcon in
            guard let refcon else { return }
            let me = Unmanaged<WindowTracker>.fromOpaque(refcon).takeUnretainedValue()
            me.refresh()
        }
        guard AXObserverCreate(pid, cb, &obs) == .success, let obs else { onWindow?(nil); return }
        observer = obs
        let ref = Unmanaged.passUnretained(self).toOpaque()
        for n in [kAXFocusedWindowChangedNotification, kAXMainWindowChangedNotification,
                  kAXWindowCreatedNotification, kAXWindowMiniaturizedNotification, kAXWindowDeminiaturizedNotification] {
            AXObserverAddNotification(obs, app, n as CFString, ref)
        }
        CFRunLoopAddSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(obs), .defaultMode)
        refresh()
    }

    func unwatch() {
        if let obs = observer {
            CFRunLoopRemoveSource(CFRunLoopGetMain(), AXObserverGetRunLoopSource(obs), .defaultMode)
        }
        observer = nil
        appElement = nil
        windowElement = nil
        pid = 0
    }

    /// 今のウィンドウ要素（読み取り・撮影で使う。押したときだけ呼ばれる）
    var currentWindow: AXUIElement? { windowElement }

    private func focusedWindow() -> AXUIElement? {
        guard let app = appElement else { return nil }
        for attr in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {
            var v: CFTypeRef?
            if AXUIElementCopyAttributeValue(app, attr as CFString, &v) == .success, let v,
               CFGetTypeID(v) == AXUIElementGetTypeID() {
                return (v as! AXUIElement)
            }
        }
        return nil
    }

    func refresh() {
        let win = focusedWindow()
        if let obs = observer {
            if let old = windowElement, win.map({ !CFEqual($0, old) }) ?? true {
                for n in [kAXMovedNotification, kAXResizedNotification, kAXUIElementDestroyedNotification] {
                    AXObserverRemoveNotification(obs, old, n as CFString)
                }
            }
            if let win, windowElement.map({ !CFEqual($0, win) }) ?? true {
                let ref = Unmanaged.passUnretained(self).toOpaque()
                for n in [kAXMovedNotification, kAXResizedNotification, kAXUIElementDestroyedNotification] {
                    AXObserverAddNotification(obs, win, n as CFString, ref)
                }
            }
        }
        windowElement = win
        onWindow?(win.flatMap(Self.frame(of:)))
    }

    static func frame(of el: AXUIElement) -> Rect? {
        var posV: CFTypeRef?, sizeV: CFTypeRef?, minV: CFTypeRef?
        if AXUIElementCopyAttributeValue(el, kAXMinimizedAttribute as CFString, &minV) == .success,
           let m = minV as? Bool, m { return nil }
        guard AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &posV) == .success,
              AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &sizeV) == .success,
              let posV, let sizeV else { return nil }
        var p = CGPoint.zero, s = CGSize.zero
        AXValueGetValue(posV as! AXValue, .cgPoint, &p)
        AXValueGetValue(sizeV as! AXValue, .cgSize, &s)
        return Rect(x: p.x, y: p.y, w: s.width, h: s.height)
    }

    /// 画面の可視領域（メニューバー・Dock を除く）を左上原点で
    static func screens() -> [Rect] {
        guard let primary = NSScreen.screens.first else { return [] }
        let h = primary.frame.height
        return NSScreen.screens.map { s in
            let v = s.visibleFrame
            return fromCocoa(Rect(x: v.minX, y: v.minY, w: v.width, h: v.height), primaryHeight: h)
        }
    }

    static var primaryHeight: Double { Double(NSScreen.screens.first?.frame.height ?? 0) }
}
