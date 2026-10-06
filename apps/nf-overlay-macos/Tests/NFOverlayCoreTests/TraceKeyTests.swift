// v7 [OP-09c] 道筋の欄の鍵の形・オフラインの判定の表示（本物のキーチェーンは使わない）
import Foundation
import Testing
@testable import NFOverlayCore

@Suite struct TraceKeyTests {
    @Test func secretShape() {
        #expect(isValidTraceSecret("fake-key-ABCDEFGH-0123"))
        #expect(!isValidTraceSecret("short"))
        #expect(!isValidTraceSecret("has space inside!!"))
        #expect(!isValidTraceSecret("quote\"inside-12345"))
        #expect(!isValidTraceSecret("back\\slash-123456"))
        #expect(!isValidTraceSecret("全角の鍵はだめですよね"))
    }

    @Test func statusNoKeyOfflineOnline() {
        let none = traceStatusView(provider: nil, model: "", hasKey: false, online: nil)
        #expect(none.state == .noKey)
        #expect(none.label.hasPrefix("鍵なし"))
        #expect(none.steps == traceLedgerSteps)

        let off = traceStatusView(provider: .anthropic, model: "m", hasKey: true, online: false)
        #expect(off.state == .offline)
        #expect(off.label.hasPrefix("オフライン"))
        #expect(!off.steps.contains("S10_route"))

        let unknown = traceStatusView(provider: .openai, model: "m", hasKey: true, online: nil)
        #expect(unknown.state == .offline)

        let on = traceStatusView(provider: .google, model: "g-1", hasKey: true, online: true)
        #expect(on.state == .ok)
        #expect(on.label == "Google の g-1（利用者の鍵）でモデルの段も出します")
        #expect(on.steps.contains("S10_route"))
        #expect(on.steps.contains("S04_industry"))
    }

    @Test func memoryStoreKeepsNothingOnDiskAndRejectsBadKeys() throws {
        let s = MemoryTraceStore()
        #expect(s.get(.anthropic) == nil)
        try s.set(.anthropic, "fake-key-ABCDEFGH-0123")
        #expect(s.get(.anthropic) == "fake-key-ABCDEFGH-0123")
        #expect(throws: TraceKeyError.badSecret) { try s.set(.openai, "bad key") }
        s.delete(.anthropic)
        #expect(s.get(.anthropic) == nil)
    }

    @Test func providerHostsMatchNodeSide() {
        #expect(TraceProvider.allCases.map(\.host) == ["api.anthropic.com", "api.openai.com", "generativelanguage.googleapis.com"])
        #expect(traceKeychainService == "jp.neurafusion.trace")
    }
}
