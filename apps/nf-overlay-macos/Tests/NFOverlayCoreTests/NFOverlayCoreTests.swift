// TS-38（Mac 分）: 丸がウィンドウの移動・大きさの変更についていくこと、アプリごとのオン・オフが効くこと、
// 「読めた・読めない」の記録が出ること、押すまで読まないこと。ウィンドウの位置と読み取りの結果はモック。

import Foundation
import Testing
@testable import NFOverlayCore

let claude = OverlayApp(id: "claude", label: "Anthropic Claude", mac: ["com.anthropic.claudefordesktop"], enabled: true)
let cursor = OverlayApp(id: "cursor", label: "Cursor", mac: ["com.todesktop.230313mzl4w4u92"], enabled: false)
let axOnlyApp = OverlayApp(id: "notion", label: "Notion", mac: ["notion.id"], enabled: true, read: .axOnly)
let offApp = OverlayApp(id: "chatgpt", label: "ChatGPT", mac: ["com.openai.codex"], enabled: true, read: .off)
let cfg = OverlayConfig(apps: [claude, cursor, axOnlyApp, offApp], size: 44, margin: 16)
let mainScreen = Rect(x: 0, y: 25, w: 1440, h: 875) // メニューバーの下（左上原点）
let rightScreen = Rect(x: 1440, y: 0, w: 1920, h: 1080)

func shown(_ effects: [OverlayEffect]) -> Rect? {
    for e in effects { if case let .showDot(r) = e { return r } }
    return nil
}

func emitted(_ effects: [OverlayEffect]) -> [OutboundMessage] {
    effects.compactMap { if case let .emit(m) = $0 { return m } else { return nil } }
}

@Suite("位置の計算")
struct GeometryTests {
    @Test func 右下に重ねる() {
        let d = dotFrame(window: Rect(x: 100, y: 100, w: 800, h: 600), screens: [mainScreen], size: 44, margin: 16)
        #expect(d == Rect(x: 840, y: 640, w: 44, h: 44))
    }

    @Test func 画面の右端からはみ出したウィンドウでは丸を画面の中に押し戻す() {
        let d = dotFrame(window: Rect(x: 1000, y: 100, w: 800, h: 600), screens: [mainScreen], size: 44, margin: 16)
        #expect(d.maxX <= mainScreen.maxX)
        #expect(d.y == 640)
    }

    @Test func 画面の下端からはみ出したウィンドウ() {
        let d = dotFrame(window: Rect(x: 100, y: 500, w: 800, h: 600), screens: [mainScreen], size: 44, margin: 16)
        #expect(d.maxY <= mainScreen.maxY)
    }

    @Test func 複数画面では右下の角が乗っている画面に置く() {
        let w = Rect(x: 1500, y: 100, w: 1000, h: 700)
        #expect(screenFor(window: w, screens: [mainScreen, rightScreen]) == rightScreen)
        let d = dotFrame(window: w, screens: [mainScreen, rightScreen], size: 44, margin: 16)
        #expect(d == Rect(x: 2440, y: 740, w: 44, h: 44))
    }

    @Test func 二つの画面にまたがるウィンドウは右下の角の画面() {
        let w = Rect(x: 1000, y: 100, w: 900, h: 500)
        #expect(screenFor(window: w, screens: [mainScreen, rightScreen]) == rightScreen)
    }

    @Test func 丸より小さいウィンドウでも左上にはみ出さない() {
        let d = dotFrame(window: Rect(x: 300, y: 300, w: 30, h: 30), screens: [mainScreen], size: 44, margin: 16)
        #expect(d.x == 300 && d.y == 300)
    }

    @Test func 左上原点と左下原点の変換は往復で戻る() {
        let r = Rect(x: 10, y: 20, w: 44, h: 44)
        let c = toCocoa(r, primaryHeight: 900)
        #expect(c == Rect(x: 10, y: 836, w: 44, h: 44))
        #expect(fromCocoa(c, primaryHeight: 900) == r)
    }

    @Test func パネルは丸の上に画面の中で開く() {
        let dot = Rect(x: 840, y: 640, w: 44, h: 44)
        let p = panelFrame(dot: dot, screens: [mainScreen], width: 380, height: 560)
        #expect(p.maxX == dot.maxX)
        #expect(p.y >= mainScreen.y)
        #expect(p.maxY <= dot.y)
    }
}

@Suite("状態（追従・オン・オフ・押すまで読まない）")
struct StateTests {
    @Test func 移動と大きさの変更についていく() {
        var s = OverlayState()
        _ = s.handle(.config(cfg))
        let w = s.handle(.frontApp(bundleId: "com.anthropic.claudefordesktop"))
        #expect(w == [.watchWindow(bundleId: "com.anthropic.claudefordesktop")])
        let a = s.handle(.window(Rect(x: 100, y: 100, w: 800, h: 600), screens: [mainScreen]))
        #expect(shown(a) == Rect(x: 840, y: 640, w: 44, h: 44))
        // 移動
        let b = s.handle(.window(Rect(x: 200, y: 150, w: 800, h: 600), screens: [mainScreen]))
        #expect(shown(b) == Rect(x: 940, y: 690, w: 44, h: 44))
        // 大きさの変更
        let c = s.handle(.window(Rect(x: 200, y: 150, w: 600, h: 400), screens: [mainScreen]))
        #expect(shown(c) == Rect(x: 740, y: 490, w: 44, h: 44))
        // Node に geometry が出る
        #expect(emitted(c).contains(.geometry(app: "claude", window: Rect(x: 200, y: 150, w: 600, h: 400), dot: Rect(x: 740, y: 490, w: 44, h: 44))))
        // 同じ位置なら何もしない
        #expect(s.handle(.window(Rect(x: 200, y: 150, w: 600, h: 400), screens: [mainScreen])).isEmpty)
    }

    @Test func 対応していないアプリでは出さない() {
        var s = OverlayState()
        _ = s.handle(.config(cfg))
        let e = s.handle(.frontApp(bundleId: "com.apple.finder"))
        #expect(e.contains(.hideDot))
        #expect(s.handle(.window(Rect(x: 0, y: 0, w: 500, h: 500), screens: [mainScreen])).isEmpty)
        #expect(s.handle(.clicked).isEmpty)
    }

    @Test func オフのアプリでは出さない() {
        var s = OverlayState()
        _ = s.handle(.config(cfg))
        let e = s.handle(.frontApp(bundleId: "com.todesktop.230313mzl4w4u92"))
        #expect(e.contains(.hideDot))
        #expect(emitted(e).contains(.hidden(.disabled)))
        #expect(s.handle(.window(Rect(x: 0, y: 30, w: 500, h: 500), screens: [mainScreen])).isEmpty)
    }

    @Test func 表示中にオフに切り替えたら隠れる() {
        var s = OverlayState()
        _ = s.handle(.config(cfg))
        _ = s.handle(.frontApp(bundleId: "com.anthropic.claudefordesktop"))
        _ = s.handle(.window(Rect(x: 100, y: 100, w: 800, h: 600), screens: [mainScreen]))
        var off = cfg
        off.apps[0].enabled = false
        let e = s.handle(.config(off))
        #expect(e.contains(.hideDot))
        #expect(emitted(e).contains(.hidden(.disabled)))
        #expect(s.handle(.clicked).isEmpty)
    }

    @Test func 設定が来る前は何もしない() {
        var s = OverlayState()
        #expect(s.handle(.frontApp(bundleId: "com.anthropic.claudefordesktop")).isEmpty)
    }

    @Test func 押すまで読まない_押したら1回だけ読む() {
        var s = OverlayState()
        _ = s.handle(.config(cfg))
        _ = s.handle(.frontApp(bundleId: "com.anthropic.claudefordesktop"))
        var all: [OverlayEffect] = []
        all += s.handle(.window(Rect(x: 100, y: 100, w: 800, h: 600), screens: [mainScreen]))
        all += s.handle(.window(Rect(x: 120, y: 100, w: 800, h: 600), screens: [mainScreen]))
        all += s.handle(.frontApp(bundleId: "com.anthropic.claudefordesktop"))
        all += s.handle(.window(Rect(x: 120, y: 100, w: 700, h: 600), screens: [mainScreen]))
        #expect(!all.contains(where: { if case .read = $0 { return true } else { return false } }))
        #expect(s.readsRequested == 0)
        let c = s.handle(.clicked)
        #expect(c == [.emit(.clicked(app: "claude")), .read(appId: "claude", mode: .axThenOcr), .openPanel])
        #expect(s.readsRequested == 1)
    }

    @Test func 読まない設定のアプリは押してもパネルだけ() {
        var s = OverlayState()
        _ = s.handle(.config(cfg))
        _ = s.handle(.frontApp(bundleId: "com.openai.codex"))
        _ = s.handle(.window(Rect(x: 100, y: 100, w: 800, h: 600), screens: [mainScreen]))
        let c = s.handle(.clicked)
        #expect(!c.contains(where: { if case .read = $0 { return true } else { return false } }))
        #expect(c.contains(.openPanel))
        #expect(s.readsRequested == 0)
    }

    @Test func ウィンドウが無くなったら隠す() {
        var s = OverlayState()
        _ = s.handle(.config(cfg))
        _ = s.handle(.frontApp(bundleId: "com.anthropic.claudefordesktop"))
        _ = s.handle(.window(Rect(x: 100, y: 100, w: 800, h: 600), screens: [mainScreen]))
        let e = s.handle(.window(nil, screens: [mainScreen]))
        #expect(e == [.hideDot, .emit(.hidden(.noWindow))])
        #expect(s.handle(.clicked).isEmpty)
    }
}

@Suite("読み取りの段取りと記録")
struct ReadPlanTests {
    @Test func AXで読めたらそれで終わり() {
        let r = planAfterAx(mode: .axThenOcr, ax: AxOutcome(permitted: true, text: "  答え  "))
        #expect(r == .done(method: .ax, ok: true, reason: nil, text: "答え"))
    }

    @Test func AXが空なら撮る前に同意を聞く() {
        #expect(planAfterAx(mode: .axThenOcr, ax: AxOutcome(permitted: true, text: " ")) == .askOcrConsent)
        #expect(planAfterAx(mode: .axThenOcr, ax: AxOutcome(permitted: false, text: "")) == .askOcrConsent)
    }

    @Test func AXだけの設定では撮らない() {
        #expect(planAfterAx(mode: .axOnly, ax: AxOutcome(permitted: true, text: "")) == .done(method: .ax, ok: false, reason: .axEmpty, text: nil))
        #expect(planAfterAx(mode: .axOnly, ax: AxOutcome(permitted: false, text: "")) == .done(method: .ax, ok: false, reason: .axDenied, text: nil))
    }

    @Test func 同意が無ければ撮らない_許可が無ければ撮らない() {
        #expect(planAfterConsent(consented: false, screenPermitted: true) == .done(method: .none, ok: false, reason: .consentDeclined, text: nil))
        #expect(planAfterConsent(consented: true, screenPermitted: false) == .done(method: .ocr, ok: false, reason: .screenDenied, text: nil))
        #expect(planAfterConsent(consented: true, screenPermitted: true) == .captureWindow)
    }

    @Test func 文字認識の結果() {
        #expect(planAfterOcr(text: "") == .done(method: .ocr, ok: false, reason: .ocrEmpty, text: nil))
        #expect(planAfterOcr(text: "abc") == .done(method: .ocr, ok: true, reason: nil, text: "abc"))
    }

    @Test func 上限で切る() {
        let long = String(repeating: "あ", count: overlayTextLimit + 50)
        #expect(normalizeRead(long).count == overlayTextLimit)
    }

    @Test func AXの断片の重複を落とす() {
        #expect(joinAxFragments(["質問", "質問", " ", "答え"]) == "質問\n答え")
    }

    @Test func 読めた読めないの記録() {
        var t = ReadTally()
        #expect(t.verdict == "untried")
        t.add(method: .none, ok: false, reason: .consentDeclined)
        #expect(t.verdict == "unreadable")
        #expect(t.lastReason == "consent-declined")
        t.add(method: .ocr, ok: true, reason: nil)
        #expect(t.verdict == "ocr")
        t.add(method: .ax, ok: true, reason: nil)
        #expect(t.verdict == "ax")
        #expect(t.axOk == 1 && t.ocrOk == 1 && t.failed == 1)
    }
}

@Suite("約束（JSON 1行）")
struct ProtocolTests {
    @Test func configを読める() {
        let line = #"{"v":1,"type":"config","apps":[{"id":"claude","label":"Claude","mac":["com.anthropic.claudefordesktop"],"win":[],"enabled":true,"read":"ax-then-ocr"}],"panelMode":"disconnected","ocrConsent":"ask-each-time","size":44,"margin":16}"#
        guard case let .config(c) = decodeInbound(line) else { Issue.record("not config"); return }
        #expect(c.apps.first?.mac == ["com.anthropic.claudefordesktop"])
        #expect(c.panelMode == .disconnected)
        #expect(c.panelUrl == nil)
    }

    @Test func 知らないtypeと壊れた行() {
        #expect(decodeInbound(#"{"v":1,"type":"future-thing"}"#) == .unknown("future-thing"))
        #expect(decodeInbound("not json") == .malformed)
        #expect(decodeInbound(#"{"v":1,"type":"stop"}"#) == .stop)
    }

    @Test func 読めなかったときは本文を出さない() {
        let s = encodeOutbound(.read(app: "claude", method: .ocr, ok: false, chars: 0, reason: .screenDenied, text: "漏れてはいけない"))
        #expect(!s.contains("漏れてはいけない"))
        #expect(s.contains(#""reason":"screen-denied""#))
        #expect(!s.contains("\n"))
    }

    @Test func geometryの形() {
        let s = encodeOutbound(.geometry(app: "claude", window: Rect(x: 1, y: 2, w: 3, h: 4), dot: Rect(x: 5, y: 6, w: 7, h: 8)))
        let obj = try? JSONSerialization.jsonObject(with: Data(s.utf8)) as? [String: Any]
        #expect(obj?["type"] as? String == "geometry")
        #expect((obj?["dot"] as? [String: Any])?["x"] as? Double == 5)
    }
}
