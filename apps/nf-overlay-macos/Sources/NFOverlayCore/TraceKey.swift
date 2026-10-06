// v7 [OP-09c] 道筋の欄（デスクトップ）の鍵と、オフラインの判定の表示（純粋・単体テスト済み）。
// 鍵は OS のキーチェーンだけに置く（本体の KeychainTraceStore＝SecItem）。ファイル・ログ・画面に出さない。
// Node 側（src/trace/keychain.ts）と同じ置き場: サービス jp.neurafusion.trace・アカウント＝会社の名前。
// 表示の文は src/trace/session.ts の traceStatus と同じ。

import Foundation

public enum TraceProvider: String, Sendable, CaseIterable {
    case anthropic, openai, google

    public var label: String {
        switch self {
        case .anthropic: "Anthropic"
        case .openai: "OpenAI"
        case .google: "Google"
        }
    }

    /// オフラインの判定に名前を引く宛先
    public var host: String {
        switch self {
        case .anthropic: "api.anthropic.com"
        case .openai: "api.openai.com"
        case .google: "generativelanguage.googleapis.com"
        }
    }
}

public let traceKeychainService = "jp.neurafusion.trace"

/// 鍵の置き場の口（本体は SecItem・テストはメモリ）
public protocol TraceSecretStore: AnyObject {
    func get(_ provider: TraceProvider) -> String?
    func set(_ provider: TraceProvider, _ secret: String) throws
    func delete(_ provider: TraceProvider)
}

public enum TraceKeyError: Error, Equatable {
    case badSecret
    case keychain(Int32)
}

/// 鍵の形（印字できる ASCII・8〜512 字・引用符と空白と逆斜線なし）。Node 側と同じ決まり
public func isValidTraceSecret(_ s: String) -> Bool {
    guard (8...512).contains(s.unicodeScalars.count) else { return false }
    return s.unicodeScalars.allSatisfy { u in
        u.value >= 0x21 && u.value <= 0x7e && u != "\"" && u != "\\"
    }
}

public enum TraceModelState: String, Sendable {
    case ok
    case noKey = "no_key"
    case offline
}

public struct TraceStatusView: Equatable, Sendable {
    public var state: TraceModelState
    /// 画面に出す一言（鍵の値は入らない）
    public var label: String
    /// 出せる段（台帳だけの段は常に・モデルの段は ok の時だけ）
    public var steps: [String]
}

public let traceLedgerSteps = ["S04_industry", "S05_cells", "S06_lens", "S12_alternatives", "S13_prereq"]
public let traceModelSteps = ["S10_route", "S11_essence", "S14_next"]

/// 鍵の有無とつながり（nil＝まだ見ていない）から、状態と表示の一言を決める
public func traceStatusView(provider: TraceProvider?, model: String, hasKey: Bool, online: Bool?) -> TraceStatusView {
    guard let p = provider, hasKey else {
        return TraceStatusView(state: .noKey, label: "鍵なし: 端末の台帳だけで 業種・マス・レンズ・別の道・前提の鎖 まで出します", steps: traceLedgerSteps)
    }
    if online != true {
        return TraceStatusView(state: .offline, label: "オフライン: 端末の台帳だけで出します（モデルの段はつながったら出ます）", steps: traceLedgerSteps)
    }
    return TraceStatusView(state: .ok, label: "\(p.label) の \(model)（利用者の鍵）でモデルの段も出します", steps: traceLedgerSteps + traceModelSteps)
}

/// テストと、キーチェーンが使えない時の代わり（鍵はメモリだけ・ファイルに書かない）
public final class MemoryTraceStore: TraceSecretStore {
    private var data: [TraceProvider: String] = [:]
    public init() {}
    public func get(_ provider: TraceProvider) -> String? { data[provider] }
    public func set(_ provider: TraceProvider, _ secret: String) throws {
        guard isValidTraceSecret(secret) else { throw TraceKeyError.badSecret }
        data[provider] = secret
    }
    public func delete(_ provider: TraceProvider) { data[provider] = nil }
}
