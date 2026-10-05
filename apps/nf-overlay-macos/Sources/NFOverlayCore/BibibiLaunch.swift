// v6 [UX-01] ビビビ（体験モード）を開く口の設定（純粋・単体テスト済み）。
// 設定は ux のサーバ（neurafusion engine/bibibi/ux）と同じファイル NF_BIBIBI_DIR/ux-settings.json を読む。
// どの口（キー・右下の丸・音声）を使うかは、そのファイルの "triggers" で本人が選ぶ。ファイルが無ければ何もしない。
// 開くのは端末内の画面（127.0.0.1 / localhost の http）だけ。

import Foundation

public enum BibibiTrigger: String, Sendable, CaseIterable {
    case hotkey, mark, voice
}

public enum BibibiCorner: String, Sendable {
    case bottomRight = "bottom-right"
    case bottomLeft = "bottom-left"
}

public struct BibibiLaunchConfig: Equatable, Sendable {
    public var triggers: Set<BibibiTrigger>
    /// キー（FF と同じ形。carbonHotKey で Carbon の値にする）。書き方が不正なら nil
    public var chord: FfChord?
    public var voicePhrase: String
    public var corner: BibibiCorner
    public var url: URL

    public static let defaultURL = URL(string: "http://127.0.0.1:8793/")!

    public init(triggers: Set<BibibiTrigger>, chord: FfChord?, voicePhrase: String, corner: BibibiCorner, url: URL) {
        self.triggers = triggers
        self.chord = chord
        self.voicePhrase = voicePhrase
        self.corner = corner
        self.url = url
    }
}

/// "Alt+Shift+B" / "Command+P" → FfChord（mods は ctrl・alt・shift・meta）
public func bibibiChord(_ s: String) -> FfChord? {
    var parts = s.split(separator: "+").map(String.init)
    guard parts.count >= 2, let key = parts.popLast(), !key.isEmpty else { return nil }
    var mods: [String] = []
    for p in parts {
        let m: String
        switch p {
        case "Alt": m = "alt"
        case "Shift": m = "shift"
        case "Ctrl", "MacCtrl": m = "ctrl"
        case "Command": m = "meta"
        default: return nil
        }
        if mods.contains(m) { return nil }
        mods.append(m)
    }
    let chord = FfChord(mods: mods, key: key.lowercased())
    return carbonHotKey(chord) == nil ? nil : chord
}

/// 端末内の http だけを通す
public func bibibiSafeURL(_ s: String?) -> URL? {
    guard let s, let u = URL(string: s), u.scheme == "http", let h = u.host, h == "127.0.0.1" || h == "localhost" else { return nil }
    return u
}

/// ux-settings.json の中身 → 起動の口の設定。読めなければ nil（何もしない）
public func parseBibibiSettings(_ data: Data, urlOverride: String? = nil) -> BibibiLaunchConfig? {
    guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    let trig = (obj["triggers"] as? [String] ?? ["hotkey", "mark"]).compactMap(BibibiTrigger.init(rawValue:))
    let hotkey = obj["hotkey"] as? String ?? "Alt+Shift+B"
    let phrase = (obj["voice_phrase"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "ビビビ"
    let corner = (obj["mark_corner"] as? String).flatMap(BibibiCorner.init(rawValue:)) ?? .bottomRight
    let url = bibibiSafeURL(urlOverride) ?? BibibiLaunchConfig.defaultURL
    return BibibiLaunchConfig(triggers: Set(trig), chord: bibibiChord(hotkey), voicePhrase: phrase, corner: corner, url: url)
}

/// 設定ファイルの場所（NF_BIBIBI_DIR、無ければ ~/.nf-bibibi）
public func bibibiSettingsPath(env: [String: String]) -> String {
    let dir = env["NF_BIBIBI_DIR"].flatMap { $0.isEmpty ? nil : $0 } ?? ((env["HOME"] ?? NSHomeDirectory()) + "/.nf-bibibi")
    return dir + "/ux-settings.json"
}

/// 右下（左下）の丸の位置。画面の見える範囲の角から margin 離す
public func bibibiMarkFrame(visible: Rect, size: Double, corner: BibibiCorner, margin: Double = 16) -> Rect {
    let x = corner == .bottomRight ? visible.x + visible.w - size - margin : visible.x + margin
    return Rect(x: x, y: visible.y + margin, w: size, h: size)
}
