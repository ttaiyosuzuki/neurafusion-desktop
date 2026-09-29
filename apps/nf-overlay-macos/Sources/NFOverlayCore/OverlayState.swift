// NF 右下の丸 — 状態の移り変わり（DK-01/02/05）。AppKit から来た出来事を受け取り、
// 出すべき画面の変化と Node への行を返すだけの純粋な型。本体（main.swift）はこれに従うだけ。
//
// 約束: 本文を読むのは `.clicked` のあと1回だけ。前面のアプリ・ウィンドウの位置と大きさ以外は見ない。

public enum OverlayEvent: Equatable, Sendable {
    case config(OverlayConfig)
    /// 前面のアプリが変わった（bundle id。nil は取れなかった）
    case frontApp(bundleId: String?)
    /// 対象のアプリのウィンドウの位置・大きさ（nil はウィンドウが無い）。screens は左上原点の可視領域。
    case window(Rect?, screens: [Rect])
    case clicked
}

public enum OverlayEffect: Equatable, Sendable {
    case showDot(Rect)
    case hideDot
    /// 前面のアプリの位置・大きさの通知を受け始める（本文は読まない）
    case watchWindow(bundleId: String)
    case unwatchWindow
    /// 押されたので、そのアプリの本文を1回だけ読む
    case read(appId: String, mode: ReadMode)
    /// パネルを開く（読まないアプリでも開く）
    case openPanel
    case emit(OutboundMessage)
}

/// bundle id → 対応アプリ（オン・オフに関わらず）
public func matchApp(bundleId: String?, apps: [OverlayApp]) -> OverlayApp? {
    guard let bundleId, !bundleId.isEmpty else { return nil }
    return apps.first(where: { $0.mac.contains(bundleId) })
}

public struct OverlayState: Sendable {
    public private(set) var config: OverlayConfig?
    public private(set) var current: OverlayApp?
    public private(set) var lastWindow: Rect?
    public private(set) var dot: Rect?
    public private(set) var readsRequested = 0

    public init() {}

    public mutating func handle(_ event: OverlayEvent) -> [OverlayEffect] {
        switch event {
        case let .config(cfg):
            config = cfg
            // 今の前面のアプリがオフになったら隠す
            if let cur = current, let now = matchApp(bundleId: cur.mac.first, apps: cfg.apps) {
                current = now
                if !now.enabled { return hide(.disabled) }
            }
            return []
        case let .frontApp(bundleId):
            guard let cfg = config else { return [] }
            guard let app = matchApp(bundleId: bundleId, apps: cfg.apps) else {
                current = nil
                return hide(.notTarget)
            }
            guard app.enabled else {
                current = nil
                return hide(.disabled)
            }
            current = app
            return [.watchWindow(bundleId: bundleId ?? "")]
        case let .window(rect, screens):
            guard let cfg = config, let app = current else { return [] }
            guard let rect, rect.w > 0, rect.h > 0 else {
                lastWindow = nil
                dot = nil
                return [.hideDot, .emit(.hidden(.noWindow))]
            }
            let d = dotFrame(window: rect, screens: screens, size: cfg.size, margin: cfg.margin)
            if rect == lastWindow, d == dot { return [] } // 同じ位置なら何もしない
            lastWindow = rect
            dot = d
            return [.showDot(d), .emit(.geometry(app: app.id, window: rect, dot: d))]
        case .clicked:
            guard let app = current, dot != nil else { return [] }
            var out: [OverlayEffect] = [.emit(.clicked(app: app.id))]
            if app.read == .off {
                out.append(.emit(.read(app: app.id, method: .none, ok: false, chars: 0, reason: .readOff, text: nil)))
            } else {
                readsRequested += 1
                out.append(.read(appId: app.id, mode: app.read))
            }
            out.append(.openPanel)
            return out
        }
    }

    private mutating func hide(_ reason: HiddenReason) -> [OverlayEffect] {
        let wasShown = dot != nil || lastWindow != nil
        lastWindow = nil
        dot = nil
        var out: [OverlayEffect] = [.hideDot, .unwatchWindow]
        if wasShown || reason != .notTarget { out.append(.emit(.hidden(reason))) }
        return out
    }
}
