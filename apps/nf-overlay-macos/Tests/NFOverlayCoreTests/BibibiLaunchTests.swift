// v6 [UX-01] ビビビを開く口の設定（ux-settings.json）の読み方
import Foundation
import Testing
@testable import NFOverlayCore

@Suite struct BibibiLaunchTests {
    @Test func defaultsWhenKeysMissing() throws {
        let c = try #require(parseBibibiSettings(Data("{}".utf8)))
        #expect(c.triggers == [.hotkey, .mark])
        #expect(c.chord == FfChord(mods: ["alt", "shift"], key: "b"))
        #expect(c.voicePhrase == "ビビビ")
        #expect(c.corner == .bottomRight)
        #expect(c.url.absoluteString == "http://127.0.0.1:8793/")
    }

    @Test func ownerChoosesTriggers() throws {
        let json = #"{"triggers":["voice"],"hotkey":"Command+P","voice_phrase":"びびび","mark_corner":"bottom-left"}"#
        let c = try #require(parseBibibiSettings(Data(json.utf8)))
        #expect(c.triggers == [.voice])
        #expect(c.chord == FfChord(mods: ["meta"], key: "p"))
        #expect(c.voicePhrase == "びびび")
        #expect(c.corner == .bottomLeft)
    }

    @Test func brokenFileDoesNothing() {
        #expect(parseBibibiSettings(Data("not json".utf8)) == nil)
        #expect(parseBibibiSettings(Data("[1]".utf8)) == nil)
    }

    @Test func chordParsing() {
        #expect(bibibiChord("Alt+Shift+B") != nil)
        #expect(bibibiChord("B") == nil)
        #expect(bibibiChord("Hyper+B") == nil)
        #expect(bibibiChord("Alt+Alt+B") == nil)
        #expect(bibibiChord("Alt+F21") == nil) // Mac に無いキー
    }

    @Test func onlyLoopbackURLs() {
        #expect(bibibiSafeURL("http://127.0.0.1:9000/") != nil)
        #expect(bibibiSafeURL("http://localhost:8793/") != nil)
        #expect(bibibiSafeURL("https://127.0.0.1:8793/") == nil)
        #expect(bibibiSafeURL("http://evil.example/") == nil)
        let c = parseBibibiSettings(Data("{}".utf8), urlOverride: "http://evil.example/")
        #expect(c?.url == BibibiLaunchConfig.defaultURL)
    }

    @Test func settingsPath() {
        #expect(bibibiSettingsPath(env: ["NF_BIBIBI_DIR": "/x/y"]) == "/x/y/ux-settings.json")
        #expect(bibibiSettingsPath(env: ["HOME": "/Users/a"]) == "/Users/a/.nf-bibibi/ux-settings.json")
    }

    @Test func markSitsInTheChosenCorner() {
        let v = Rect(x: 0, y: 25, w: 1440, h: 875)
        #expect(bibibiMarkFrame(visible: v, size: 28, corner: .bottomRight) == Rect(x: 1396, y: 41, w: 28, h: 28))
        #expect(bibibiMarkFrame(visible: v, size: 28, corner: .bottomLeft) == Rect(x: 16, y: 41, w: 28, h: 28))
    }
}
