// FY-16 (4): elements の行（AX の木の写し）。ネイティブは手がかりと文を写すだけで、出どころは付けない。

import Foundation
import Testing
@testable import NFOverlayCore

private func parse(_ line: String) -> [String: Any] {
    (try? JSONSerialization.jsonObject(with: Data(line.utf8))) as? [String: Any] ?? [:]
}

@Test func elementsLineCarriesHintsButNoOrigin() {
    let tree = AxSnapNode(role: "AXWindow", children: [
        AxSnapNode(role: "AXGroup", classes: ["nf-synth-user-turn"], children: [AxSnapNode(role: "AXStaticText", text: "〔本〕発話")]),
        AxSnapNode(role: "AXTextArea", editable: true, text: "〔他〕下書き"),
    ])
    let d = parse(encodeOutbound(.elements(app: "claude", root: tree, hover: .at([0, 0]))))
    #expect(d["type"] as? String == "elements")
    #expect(d["method"] as? String == "ax")
    #expect(d["hover"] as? [Int] == [0, 0])
    let root = d["root"] as? [String: Any]
    let kids = root?["children"] as? [[String: Any]]
    #expect(kids?.count == 2)
    #expect(kids?[0]["classes"] as? [String] == ["nf-synth-user-turn"])
    #expect(kids?[1]["editable"] as? Bool == true)
    // 出どころはネイティブでは決めない
    #expect(!encodeOutbound(.elements(app: "claude", root: tree, hover: .unknown)).contains("origin"))
}

@Test func elementsHoverKeyIsAbsentNullOrPath() {
    let n = AxSnapNode(role: "AXWindow")
    #expect(parse(encodeOutbound(.elements(app: "claude", root: n, hover: .unknown)))["hover"] == nil)
    #expect(parse(encodeOutbound(.elements(app: "claude", root: n, hover: .off)))["hover"] is NSNull)
}

@Test func limitSnapCapsDepthAndText() {
    var deep = AxSnapNode(role: "AXStaticText", text: "x")
    for _ in 0..<100 { deep = AxSnapNode(role: "AXGroup", children: [deep]) }
    var depth = 0
    var cur: AxSnapNode? = limitSnap(deep)
    while let c = cur, let k = c.children.first { depth += 1; cur = k }
    #expect(depth == 80)
    let long = AxSnapNode(role: "AXWindow", children: [
        AxSnapNode(role: "AXStaticText", text: String(repeating: "a", count: overlayTextLimit)),
        AxSnapNode(role: "AXStaticText", text: "b"),
    ])
    let cut = limitSnap(long)
    #expect(cut.children[0].text?.count == overlayTextLimit)
    #expect(cut.children[1].text == nil)
}
