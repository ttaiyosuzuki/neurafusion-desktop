// FF 先読み（Mac 分）: ff-* の行の読み書き・キー → Carbon・行の窓の状態（押すまで何も出ない・表示中だけのキー）。

import Foundation
import Testing
@testable import NFOverlayCore

private let cfgLine = #"{"v":1,"type":"ff-config","enabled":true,"keys":{"trigger":{"mods":["alt","shift"],"key":","},"adopt":{"mods":["alt","shift"],"key":"."},"close":{"mods":[],"key":"escape"}},"scopes":{"trigger":"global","adopt":"overlay-only","close":"overlay-only"},"labels":{"trigger":"Option+Shift+,","adopt":"Option+Shift+.","close":"Escape"},"opacity":0.72}"#

@Suite("FF 先読み")
struct FfCoreTests {
    @Test func ffConfigを読む() throws {
        guard case let .ffConfig(c) = decodeInbound(cfgLine) else { Issue.record("ff-config を読めない"); return }
        #expect(c.enabled)
        #expect(c.keys["trigger"] == FfChord(mods: ["alt", "shift"], key: ","))
        #expect(c.scope(of: .trigger) == .global)
        #expect(c.scope(of: .adopt) == .overlayOnly)
        #expect(c.opacity == 0.72)
    }

    @Test func scopesが無い古いffConfigは既定の割り当て() {
        let c = FfConfig(enabled: true, keys: [:])
        #expect(c.scope(of: .trigger) == .global)
        #expect(c.scope(of: .adopt) == .overlayOnly)
        #expect(c.scope(of: .close) == .overlayOnly)
    }

    @Test func ffLineとffHideを読む() {
        let l = decodeInbound(#"{"v":1,"type":"ff-line","press":3,"seq":0,"kind":"move","text":"1  型を直す  N=9","n":9,"reset":true}"#)
        #expect(l == .ffLine(FfLine(press: 3, seq: 0, kind: .move, text: "1  型を直す  N=9", n: 9, reset: true)))
        #expect(decodeInbound(#"{"v":1,"type":"ff-hide"}"#) == .ffHide)
        #expect(decodeInbound(#"{"v":1,"type":"ff-line","press":"x"}"#) == .malformed)
    }

    @Test func ffの書き出し() {
        #expect(encodeOutbound(.ffKey(action: .trigger, press: 4)) == #"{"action":"trigger","press":4,"type":"ff-key","v":1}"#)
        #expect(encodeOutbound(.ffDrawn(press: 4, seq: 0, ms: 12.3456)) == #"{"ms":12.35,"press":4,"seq":0,"type":"ff-drawn","v":1}"#)
        #expect(encodeOutbound(.ffKeys(ok: false, failed: [.adopt])) == #"{"failed":["adopt"],"ok":false,"type":"ff-keys","v":1}"#)
    }

    @Test func キーをCarbonのキーコードと修飾にする() {
        #expect(carbonHotKey(FfChord(mods: ["alt", "shift"], key: ",")) == CarbonHotKey(keyCode: 43, modifiers: carbonOption | carbonShift))
        #expect(carbonHotKey(FfChord(mods: ["alt", "shift"], key: ".")) == CarbonHotKey(keyCode: 47, modifiers: carbonOption | carbonShift))
        #expect(carbonHotKey(FfChord(mods: [], key: "escape")) == CarbonHotKey(keyCode: 53, modifiers: 0))
        #expect(carbonHotKey(FfChord(mods: ["ctrl", "meta"], key: "j"))?.modifiers == carbonControl | carbonCmd)
        #expect(carbonHotKey(FfChord(mods: ["alt"], key: "f24")) == nil) // Mac に無いキー
        #expect(carbonHotKey(FfChord(mods: ["hyper"], key: "a")) == nil)
    }

    @Test func 押すまで何も出ずtriggerだけ登録_表示中はadoptとcloseも() {
        guard case let .ffConfig(c) = decodeInbound(cfgLine) else { Issue.record("ff-config"); return }
        var s = FfStripState()
        #expect(!s.visible)
        #expect(s.activeActions(c) == [.trigger])
        let p = s.nextPress()
        let r = s.add(FfLine(press: p, seq: 0, kind: .move, text: "1", n: 9, reset: true))
        #expect(r.becameVisible && r.shouldReportDrawn)
        #expect(s.activeActions(c) == [.trigger, .adopt, .close])
        // 同じ押下の2行目では ff-drawn を出さない
        #expect(!s.add(FfLine(press: p, seq: 1, kind: .move, text: "2", n: 7)).shouldReportDrawn)
        #expect(s.lines.count == 2)
        // 別の枝（reset）で前の行を消す
        let p2 = s.nextPress()
        let r2 = s.add(FfLine(press: p2, seq: 0, kind: .move, text: "1b", n: 4, reset: true))
        #expect(!r2.becameVisible && r2.shouldReportDrawn)
        #expect(s.lines.map(\.text) == ["1b"])
        s.hide()
        #expect(!s.visible && s.lines.isEmpty)
        #expect(s.activeActions(c) == [.trigger])
        var off = c
        off.enabled = false
        #expect(s.activeActions(off).isEmpty)
    }
}
