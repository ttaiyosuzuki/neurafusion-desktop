// nf-overlay — NF 右下の丸（Mac）。Node の CLI（src/overlay/）が起動し、標準入出力で話す。
// 出来事は OverlayState（純粋な型・単体テスト済み）に渡し、返ってきた効果だけを実行する。

import AppKit
import NFOverlayCore

@MainActor
final class AppController {
    private var state = OverlayState()
    private let dot = DotPanel()
    private let panel = PanelWindow()
    private let tracker = WindowTracker()
    private lazy var io = StdioBridge(onMessage: { [weak self] m in self?.inbound(m) },
                                      onEOF: { NSApp.terminate(nil) })
    private var started = false
    // FF 先読み
    private let ffKeys = FfHotKeys()
    private let ffStrip = FfStrip()
    private var ffState = FfStripState()
    private var ffConfig: FfConfig?
    private var ffKeyAt: [Int: TimeInterval] = [:]
    private var reading = false
    private var currentPid: pid_t = 0

    func start() {
        dot.dotView.onClick = { [weak self] in
            guard let self else { return }
            self.apply(self.state.handle(.clicked))
        }
        tracker.onFrontApp = { [weak self] bundleId, pid in
            guard let self else { return }
            self.currentPid = pid
            self.apply(self.state.handle(.frontApp(bundleId: bundleId)))
        }
        tracker.onWindow = { [weak self] rect in
            guard let self else { return }
            self.apply(self.state.handle(.window(rect, screens: WindowTracker.screens())))
        }
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                               object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.tracker.refresh() }
        }
        ffKeys.onKey = { [weak self] action, at in
            guard let self else { return }
            let press = self.ffState.nextPress()
            self.ffKeyAt[press] = at
            if self.ffKeyAt.count > 64, let oldest = self.ffKeyAt.keys.min() { self.ffKeyAt[oldest] = nil }
            self.io.send(.ffKey(action: action, press: press))
        }
        io.start()
    }

    /// 登録しておくべきキーにそろえる（trigger はいつでも・adopt と close は行が出ている間だけ）
    private func ffSyncKeys(report: Bool) {
        guard let cfg = ffConfig else { return }
        let failed = ffKeys.sync(actions: ffState.activeActions(cfg), config: cfg)
        if report || !failed.isEmpty { io.send(.ffKeys(ok: failed.isEmpty, failed: failed)) }
    }

    private func inbound(_ m: InboundMessage) {
        switch m {
        case let .config(cfg):
            panel.configure(mode: cfg.panelMode, url: cfg.panelUrl)
            dot.setContentSize(NSSize(width: cfg.size, height: cfg.size))
            apply(state.handle(.config(cfg)))
            if !started {
                started = true
                io.send(.ready(ax: AXIsProcessTrusted(), screen: OcrReader.screenPermitted))
                tracker.start()
            } else {
                tracker.refresh()
            }
        case .stop:
            NSApp.terminate(nil)
        case let .panelText(text):
            panel.deliver(text: text)
        case let .ffConfig(cfg):
            ffConfig = cfg
            ffKeys.unregisterAll()
            ffSyncKeys(report: true)
        case let .ffLine(line):
            let r = ffState.add(line)
            ffStrip.show(lines: ffState.lines, opacity: ffConfig?.opacity ?? 0.72)
            if r.becameVisible { ffSyncKeys(report: false) }
            if r.shouldReportDrawn, let at = ffKeyAt[line.press] {
                let ms = (ProcessInfo.processInfo.systemUptime - at) * 1000
                io.send(.ffDrawn(press: line.press, seq: line.seq, ms: ms))
            }
        case .ffHide:
            ffState.hide()
            ffStrip.hide()
            ffSyncKeys(report: false)
        case .unknown, .malformed:
            break
        }
    }

    private func apply(_ effects: [OverlayEffect]) {
        for e in effects {
            switch e {
            case let .showDot(r):
                let c = toCocoa(r, primaryHeight: WindowTracker.primaryHeight)
                dot.setFrame(NSRect(x: c.x, y: c.y, width: c.w, height: c.h), display: true)
                dot.orderFrontRegardless()
            case .hideDot:
                dot.orderOut(nil)
            case .watchWindow:
                tracker.watch(pid: currentPid)
            case .unwatchWindow:
                tracker.unwatch()
            case let .read(appId, mode):
                read(appId: appId, mode: mode)
            case .openPanel:
                if let d = state.dot {
                    panel.show(at: panelFrame(dot: d, screens: WindowTracker.screens(), width: 380, height: 560))
                    io.send(.panel(open: true, mode: panel.mode))
                }
            case let .emit(msg):
                io.send(msg)
            }
        }
    }

    private func read(appId: String, mode: ReadMode) {
        guard !reading, let win = tracker.currentWindow else { return }
        reading = true
        let pid = tracker.pid
        let label = state.current?.label ?? appId
        let frame = state.lastWindow
        panel.showStatus("読み取り中…")
        var step = planAfterAx(mode: mode, ax: AxTextReader.read(window: win, pid: pid))
        if step == .askOcrConsent {
            step = planAfterConsent(consented: OcrConsent.ask(appLabel: label), screenPermitted: OcrReader.screenPermitted)
        }
        if step == .captureWindow, let frame {
            Task { @MainActor in
                let text = await OcrReader.read(pid: pid, frame: frame)
                self.finish(appId: appId, planAfterOcr(text: text))
            }
            return
        }
        finish(appId: appId, step)
    }

    private func finish(appId: String, _ step: ReadStep) {
        reading = false
        guard case let .done(method, ok, reason, text) = step else { return }
        io.send(.read(app: appId, method: method, ok: ok, chars: text?.count ?? 0, reason: reason, text: text))
        if ok {
            panel.showStatus("読み取った文字: \(text?.count ?? 0) 文字（\(method == .ax ? "画面の文字" : "文字認識")。未接続のため、どこにも送っていません）")
        } else {
            let why: String
            switch reason {
            case .axDenied: why = "アクセシビリティの許可がありません（システム設定 → プライバシーとセキュリティ）。"
            case .screenDenied: why = "画面収録の許可がありません（システム設定 → プライバシーとセキュリティ）。"
            case .consentDeclined: why = "撮影しませんでした。"
            default: why = "このウィンドウの文字を読めませんでした。"
            }
            panel.showStatus(why)
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // Dock に出さない
MainActor.assumeIsolated {
    let controller = AppController()
    controller.start()
    withExtendedLifetime(controller) { app.run() }
}
