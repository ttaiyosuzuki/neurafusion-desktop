// NF 右下の丸 — 押したときの読み取りの段取り（DK-02）と「読めた・読めない」の記録。
// AX → （読めなければ）その都度の同意 → そのウィンドウだけを撮って Vision で端末内の文字認識。


import Foundation
public let overlayTextLimit = 16000 // 拡張・src/kensan と同じ上限

public struct AxOutcome: Equatable, Sendable {
    public var permitted: Bool
    public var text: String
    public init(permitted: Bool, text: String) { self.permitted = permitted; self.text = text }
}

public enum ReadStep: Equatable, Sendable {
    case done(method: ReadMethod, ok: Bool, reason: ReadFailure?, text: String?)
    /// AX で読めなかった。画面を撮る前に本人に聞く
    case askOcrConsent
    /// 同意あり・画面収録の許可あり。ウィンドウ1つを撮る
    case captureWindow
}

/// AX の結果から次の段取りを決める。
public func planAfterAx(mode: ReadMode, ax: AxOutcome) -> ReadStep {
    let t = normalizeRead(ax.text)
    if ax.permitted, !t.isEmpty {
        return .done(method: .ax, ok: true, reason: nil, text: t)
    }
    let reason: ReadFailure = ax.permitted ? .axEmpty : .axDenied
    switch mode {
    case .axThenOcr:
        return .askOcrConsent
    case .axOnly, .off:
        return .done(method: .ax, ok: false, reason: reason, text: nil)
    }
}

/// 同意の答えと画面収録の許可から次の段取りを決める（許可のダイアログは出さない）。
public func planAfterConsent(consented: Bool, screenPermitted: Bool) -> ReadStep {
    guard consented else { return .done(method: .none, ok: false, reason: .consentDeclined, text: nil) }
    guard screenPermitted else { return .done(method: .ocr, ok: false, reason: .screenDenied, text: nil) }
    return .captureWindow
}

public func planAfterOcr(text: String) -> ReadStep {
    let t = normalizeRead(text)
    if t.isEmpty { return .done(method: .ocr, ok: false, reason: .ocrEmpty, text: nil) }
    return .done(method: .ocr, ok: true, reason: nil, text: t)
}

/// 前後の空白を落とし、上限で切る（Character 単位）。
public func normalizeRead(_ s: String) -> String {
    let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.count <= overlayTextLimit { return t }
    return String(t.prefix(overlayTextLimit))
}

/// AX の木から集めた断片をつなぐ。同じ断片の繰り返し（AXTitle と AXValue が同じ等）を落とす。
public func joinAxFragments(_ fragments: [String]) -> String {
    var seen = Set<String>()
    var out: [String] = []
    var total = 0
    for f in fragments {
        let t = f.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !seen.contains(t) else { continue }
        seen.insert(t)
        out.append(t)
        total += t.count + 1
        if total >= overlayTextLimit { break }
    }
    return out.joined(separator: "\n")
}

/// アプリごとの「読めた・読めない」の集計（本文は持たない）。
public struct ReadTally: Equatable, Sendable, Codable {
    public var axOk = 0
    public var ocrOk = 0
    public var failed = 0
    public var lastReason: String?
    public init() {}

    public mutating func add(method: ReadMethod, ok: Bool, reason: ReadFailure?) {
        if ok {
            if method == .ax { axOk += 1 } else if method == .ocr { ocrOk += 1 }
        } else {
            failed += 1
            lastReason = reason?.rawValue
        }
    }

    /// 報告用の一言: AX で読める / 文字認識なら読める / 読めない / まだ押していない
    public var verdict: String {
        if axOk > 0 { return "ax" }
        if ocrOk > 0 { return "ocr" }
        if failed > 0 { return "unreadable" }
        return "untried"
    }
}
