// NF 右下の丸 — Node との約束（docs/overlay-protocol.md）。標準入出力の JSON 1行ずつ。

import Foundation

public let overlayProtocolVersion = 1

public enum ReadMode: String, Codable, Sendable {
    case axThenOcr = "ax-then-ocr"
    case axOnly = "ax-only"
    case off
}

public enum PanelMode: String, Codable, Sendable {
    case url
    case disconnected
}

public struct OverlayApp: Codable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var mac: [String]
    public var win: [String]
    public var enabled: Bool
    public var read: ReadMode

    public init(id: String, label: String, mac: [String], win: [String] = [], enabled: Bool, read: ReadMode = .axThenOcr) {
        self.id = id
        self.label = label
        self.mac = mac
        self.win = win
        self.enabled = enabled
        self.read = read
    }
}

public struct OverlayConfig: Codable, Equatable, Sendable {
    public var v: Int
    public var type: String
    public var apps: [OverlayApp]
    public var panelUrl: String?
    public var panelMode: PanelMode
    public var ocrConsent: String
    public var size: Double
    public var margin: Double

    public init(apps: [OverlayApp], panelUrl: String? = nil, panelMode: PanelMode = .disconnected, size: Double = 44, margin: Double = 16) {
        self.v = overlayProtocolVersion
        self.type = "config"
        self.apps = apps
        self.panelUrl = panelUrl
        self.panelMode = panelMode
        self.ocrConsent = "ask-each-time"
        self.size = size
        self.margin = margin
    }
}

/// 入ってきた1行の中身。知らない type は `.unknown`（読み飛ばす）。
public enum InboundMessage: Equatable, Sendable {
    case config(OverlayConfig)
    case stop
    case panelText(String)
    /// FF 先読み
    case ffConfig(FfConfig)
    case ffLine(FfLine)
    case ffHide
    case unknown(String)
    case malformed
}

private struct TypeProbe: Decodable { var type: String }
private struct PanelTextMsg: Decodable { var text: String }

public func decodeInbound(_ line: String) -> InboundMessage {
    guard let data = line.data(using: .utf8),
          let probe = try? JSONDecoder().decode(TypeProbe.self, from: data)
    else { return .malformed }
    switch probe.type {
    case "config":
        guard let cfg = try? JSONDecoder().decode(OverlayConfig.self, from: data) else { return .malformed }
        return .config(cfg)
    case "stop":
        return .stop
    case "panel-text":
        guard let m = try? JSONDecoder().decode(PanelTextMsg.self, from: data) else { return .malformed }
        return .panelText(m.text)
    case "ff-config":
        guard let m = try? JSONDecoder().decode(FfConfig.self, from: data) else { return .malformed }
        return .ffConfig(m)
    case "ff-line":
        guard let m = try? JSONDecoder().decode(FfLine.self, from: data) else { return .malformed }
        return .ffLine(m)
    case "ff-hide":
        return .ffHide
    default:
        return .unknown(probe.type)
    }
}

public enum ReadMethod: String, Codable, Sendable {
    case ax
    case ocr
    case none
}

public enum ReadFailure: String, Codable, Sendable {
    case axDenied = "ax-denied"
    case axEmpty = "ax-empty"
    case screenDenied = "screen-denied"
    case consentDeclined = "consent-declined"
    case ocrEmpty = "ocr-empty"
    case readOff = "read-off"
}

public enum HiddenReason: String, Codable, Sendable {
    case notTarget = "not-target"
    case disabled
    case noWindow = "no-window"
}

/// 出ていく1行。`text` は `read` の ok:true のときだけ付く（Node はログに書かない）。
public enum OutboundMessage: Equatable, Sendable {
    case ready(ax: Bool, screen: Bool)
    case geometry(app: String, window: Rect, dot: Rect)
    case hidden(HiddenReason)
    case clicked(app: String)
    case read(app: String, method: ReadMethod, ok: Bool, chars: Int, reason: ReadFailure?, text: String?)
    case panel(open: Bool, mode: PanelMode)
    case error(code: String, message: String)
    /// FF 先読み: キーを受けた／その押下の最初の行を描いた（キーから ms）／全体キーの登録の結果
    case ffKey(action: FfAction, press: Int)
    case ffDrawn(press: Int, seq: Int, ms: Double)
    case ffKeys(ok: Bool, failed: [FfAction])
}

private func rectDict(_ r: Rect) -> [String: Any] {
    ["x": r.x, "y": r.y, "w": r.w, "h": r.h]
}

public func encodeOutbound(_ msg: OutboundMessage) -> String {
    var d: [String: Any] = ["v": overlayProtocolVersion]
    switch msg {
    case let .ready(ax, screen):
        d["type"] = "ready"; d["platform"] = "macos"; d["ax"] = ax; d["screen"] = screen
    case let .geometry(app, window, dot):
        d["type"] = "geometry"; d["app"] = app; d["window"] = rectDict(window); d["dot"] = rectDict(dot)
    case let .hidden(reason):
        d["type"] = "hidden"; d["reason"] = reason.rawValue
    case let .clicked(app):
        d["type"] = "clicked"; d["app"] = app
    case let .read(app, method, ok, chars, reason, text):
        d["type"] = "read"; d["app"] = app; d["method"] = method.rawValue; d["ok"] = ok; d["chars"] = chars
        if let reason { d["reason"] = reason.rawValue }
        if ok, let text { d["text"] = text }
    case let .panel(open, mode):
        d["type"] = "panel"; d["open"] = open; d["mode"] = mode.rawValue
    case let .error(code, message):
        d["type"] = "error"; d["code"] = code; d["message"] = message
    case let .ffKey(action, press):
        d["type"] = "ff-key"; d["action"] = action.rawValue; d["press"] = press
    case let .ffDrawn(press, seq, ms):
        d["type"] = "ff-drawn"; d["press"] = press; d["seq"] = seq; d["ms"] = (ms * 100).rounded() / 100
    case let .ffKeys(ok, failed):
        d["type"] = "ff-keys"; d["ok"] = ok; d["failed"] = failed.map(\.rawValue)
    }
    guard let data = try? JSONSerialization.data(withJSONObject: d, options: [.sortedKeys]),
          let s = String(data: data, encoding: .utf8)
    else { return "{\"v\":1,\"type\":\"error\",\"code\":\"encode\",\"message\":\"encode failed\"}" }
    return s
}
