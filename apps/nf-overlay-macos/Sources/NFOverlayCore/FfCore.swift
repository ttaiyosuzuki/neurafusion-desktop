// FF 先読み（Mac）— Node との行（docs/overlay-protocol.md「FF 先読み」）とキーの対応、行の窓の状態。
// 純粋な型だけ（AppKit・Carbon に触れない）。全体キーの登録と描画は NFOverlay 側（FfHotKeys・FfStrip）。

import Foundation

public enum FfAction: String, Codable, Sendable, CaseIterable {
    case trigger
    case adopt
    case close
}

public enum FfScope: String, Codable, Sendable {
    case global
    case overlayOnly = "overlay-only"
}

public struct FfChord: Codable, Equatable, Sendable {
    public var mods: [String]
    public var key: String
    public init(mods: [String], key: String) {
        self.mods = mods
        self.key = key
    }
}

public struct FfConfig: Codable, Equatable, Sendable {
    public var enabled: Bool
    public var keys: [String: FfChord]
    public var scopes: [String: FfScope]?
    public var opacity: Double?

    public init(enabled: Bool, keys: [String: FfChord], scopes: [String: FfScope]? = nil, opacity: Double? = nil) {
        self.enabled = enabled
        self.keys = keys
        self.scopes = scopes
        self.opacity = opacity
    }

    /// 既定の割り当て（scopes が無い古い Node の ff-config もこれで読む）
    public func scope(of a: FfAction) -> FfScope {
        if let s = scopes?[a.rawValue] { return s }
        return a == .trigger ? .global : .overlayOnly
    }
}

public enum FfLineKind: String, Codable, Sendable {
    case move
    case none
    case info
}

public struct FfLine: Codable, Equatable, Sendable {
    public var press: Int
    public var seq: Int
    public var kind: FfLineKind
    public var text: String
    public var n: Int?
    public var reset: Bool?

    public init(press: Int, seq: Int, kind: FfLineKind, text: String, n: Int? = nil, reset: Bool? = nil) {
        self.press = press
        self.seq = seq
        self.kind = kind
        self.text = text
        self.n = n
        self.reset = reset
    }
}

// MARK: - キー → Carbon のキーコードと修飾（US 配列の位置。JIS でも . , は同じ位置）

public struct CarbonHotKey: Equatable, Sendable {
    public var keyCode: UInt32
    public var modifiers: UInt32
}

/// Carbon の修飾（Events.h: cmdKey=0x100・shiftKey=0x200・optionKey=0x800・controlKey=0x1000）
public let carbonCmd: UInt32 = 0x0100
public let carbonShift: UInt32 = 0x0200
public let carbonOption: UInt32 = 0x0800
public let carbonControl: UInt32 = 0x1000

private let keyCodes: [String: UInt32] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11, "q": 12,
    "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22, "5": 23,
    "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29, "]": 30, "o": 31, "u": 32, "[": 33, "i": 34,
    "p": 35, "l": 37, "j": 38, "'": 39, "k": 40, ";": 41, ",": 43, "/": 44, "n": 45, "m": 46, ".": 47,
    "`": 50, "space": 49, "escape": 53,
    "f1": 122, "f2": 120, "f3": 99, "f4": 118, "f5": 96, "f6": 97, "f7": 98, "f8": 100, "f9": 101,
    "f10": 109, "f11": 103, "f12": 111, "f13": 105, "f14": 107, "f15": 113, "f16": 106, "f17": 64,
    "f18": 79, "f19": 80, "f20": 90,
]

/// 正規形 → Carbon。Mac に無いキー（F21 以降など）・知らない修飾は nil（登録できない＝ff-keys の failed）。
public func carbonHotKey(_ c: FfChord) -> CarbonHotKey? {
    guard let code = keyCodes[c.key.lowercased()] else { return nil }
    var mods: UInt32 = 0
    for m in c.mods {
        switch m {
        case "ctrl": mods |= carbonControl
        case "alt": mods |= carbonOption
        case "shift": mods |= carbonShift
        case "meta": mods |= carbonCmd
        default: return nil
        }
    }
    return CarbonHotKey(keyCode: code, modifiers: mods)
}

// MARK: - 行の窓の状態（押下ごとの最初の行で ff-drawn を1回だけ出す・overlay-only のキーは表示中だけ）

public struct FfStripState: Equatable, Sendable {
    public private(set) var visible = false
    public private(set) var lines: [FfLine] = []
    public private(set) var press = 0
    /// ff-drawn を出し終えた押下
    public private(set) var drawnPresses: Set<Int> = []
    public static let maxLines = 12

    public init() {}

    /// キーを受けた（ネイティブが押下の番号を振る）
    public mutating func nextPress() -> Int {
        press += 1
        return press
    }

    /// 1行足す。戻り値: 窓を新たに出したか・ff-drawn を出すべきか
    public mutating func add(_ l: FfLine) -> (becameVisible: Bool, shouldReportDrawn: Bool) {
        let was = visible
        if l.reset == true { lines.removeAll() }
        lines.append(l)
        if lines.count > Self.maxLines { lines.removeFirst(lines.count - Self.maxLines) }
        visible = true
        let report = l.seq == 0 && !drawnPresses.contains(l.press)
        if report { drawnPresses.insert(l.press) }
        return (!was, report)
    }

    public mutating func hide() {
        visible = false
        lines.removeAll()
    }

    /// 今登録しておくべきキー（global はいつでも、overlay-only は表示中だけ）
    public func activeActions(_ cfg: FfConfig) -> [FfAction] {
        guard cfg.enabled else { return [] }
        return FfAction.allCases.filter { cfg.scope(of: $0) == .global || visible }
    }
}
