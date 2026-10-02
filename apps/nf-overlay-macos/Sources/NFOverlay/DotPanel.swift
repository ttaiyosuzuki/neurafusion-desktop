// 右下の丸の窓（DK-01）。常に前面・フォーカスを奪わない・全スペースに出る小さな透明の窓。
// 見た目は NF の丸（2026-10-02 見た目③ icon-apps-main）: 原画 neurafusion-repo design/icon-gradient/nf-mark-gradient.svg と同じ
// 24×24 の図形を Core Graphics で描く: 左下 黄 → 右上 紫の4色の丸・中心が濃く外へ白・白ふち・白い縦長の目2つ・うっすら光の輪。
// （以前の青い球・つや・影はやめた。色は Web の LivingMark の COMPLETE_STOPS と同じ hsl を sRGB にした値）

import AppKit

/// hsl(45 97% 54%)・hsl(24 97% 54%)・hsl(335 90% 57%)・hsl(275 80% 56%)
private let markStops: [(CGFloat, NSColor)] = [
    (0, NSColor(srgbRed: 0xFB / 255.0, green: 0xC3 / 255.0, blue: 0x18 / 255.0, alpha: 1)),
    (0.36, NSColor(srgbRed: 0xFB / 255.0, green: 0x73 / 255.0, blue: 0x18 / 255.0, alpha: 1)),
    (0.68, NSColor(srgbRed: 0xF4 / 255.0, green: 0x2F / 255.0, blue: 0x81 / 255.0, alpha: 1)),
    (1, NSColor(srgbRed: 0x9E / 255.0, green: 0x35 / 255.0, blue: 0xE9 / 255.0, alpha: 1)),
]
/// 光の輪の色（桃 hsl(335 90% 57%)＝Web の COMPLETE_HALO）
private let haloColor = NSColor(srgbRed: 0xF4 / 255.0, green: 0x2F / 255.0, blue: 0x81 / 255.0, alpha: 1)
/// 原画の白の重ね（中心が濃く外へ白）
private let whiteStops: [(CGFloat, CGFloat)] = [(0, 0), (0.2, 0.04), (0.4, 0.10), (0.55, 0.15), (0.65, 0.19), (0.75, 0.27), (0.85, 0.37), (1, 0.45)]

private func mix(_ a: NSColor, _ b: NSColor, _ t: CGFloat) -> NSColor {
    let a = a.usingColorSpace(.sRGB)!, b = b.usingColorSpace(.sRGB)!
    return NSColor(srgbRed: a.redComponent * (1 - t) + b.redComponent * t,
                   green: a.greenComponent * (1 - t) + b.greenComponent * t,
                   blue: a.blueComponent * (1 - t) + b.blueComponent * t,
                   alpha: 1)
}

final class DotView: NSView {
    var onClick: (() -> Void)?
    private var pressed = false

    override var isFlipped: Bool { true } // SVG と同じく上が y=0
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func draw(_ dirtyRect: NSRect) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let s = min(bounds.width, bounds.height) / 24
        ctx.saveGState()
        ctx.scaleBy(x: s, y: s)
        let space = CGColorSpace(name: CGColorSpace.sRGB)!

        // 光の輪（62%〜100% の間だけ色が乗る）
        let glowC = mix(haloColor, .white, 0.75)
        let glow = CGGradient(colorsSpace: space,
                              colors: [glowC.withAlphaComponent(0).cgColor, glowC.withAlphaComponent(0).cgColor,
                                       glowC.withAlphaComponent(0.45).cgColor, glowC.withAlphaComponent(0).cgColor] as CFArray,
                              locations: [0, 0.62, 0.78, 1])!
        ctx.drawRadialGradient(glow, startCenter: CGPoint(x: 12, y: 12), startRadius: 0,
                               endCenter: CGPoint(x: 12, y: 12), endRadius: 11.6, options: [])

        // 本体（左下 黄 → 右上 紫）＋白の重ね＋白ふち。原画の objectBoundingBox を 3..21 の座標に直した
        ctx.saveGState()
        ctx.addEllipse(in: CGRect(x: 3, y: 3, width: 18, height: 18))
        ctx.clip()
        let body = CGGradient(colorsSpace: space, colors: markStops.map { $0.1.cgColor } as CFArray,
                              locations: markStops.map { $0.0 })!
        ctx.drawLinearGradient(body, start: CGPoint(x: 3 + 18 * 0.18, y: 3 + 18 * 0.82),
                               end: CGPoint(x: 3 + 18 * 0.82, y: 3 + 18 * 0.18),
                               options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
        let white = CGGradient(colorsSpace: space,
                               colors: whiteStops.map { NSColor.white.withAlphaComponent($0.1).cgColor } as CFArray,
                               locations: whiteStops.map { $0.0 })!
        let wc = CGPoint(x: 12, y: 3 + 18 * 0.44)
        ctx.drawRadialGradient(white, startCenter: wc, startRadius: 0, endCenter: wc, endRadius: 18 * 0.56,
                               options: [.drawsAfterEndLocation])
        let rim = CGGradient(colorsSpace: space,
                             colors: [NSColor.white.withAlphaComponent(0).cgColor, NSColor.white.withAlphaComponent(0).cgColor,
                                      NSColor.white.withAlphaComponent(0.42).cgColor, NSColor.white.withAlphaComponent(0.85).cgColor] as CFArray,
                             locations: [0, 0.93, 0.97, 1])!
        ctx.drawRadialGradient(rim, startCenter: CGPoint(x: 12, y: 12), startRadius: 0,
                               endCenter: CGPoint(x: 12, y: 12), endRadius: 9, options: [])
        ctx.restoreGState()

        // 目（押している間は少し下を見る）
        let dy: CGFloat = pressed ? 1.3 : 0
        ctx.setFillColor(NSColor.white.cgColor)
        for x in [8.37, 13.66] {
            let p = CGPath(roundedRect: CGRect(x: x, y: 7.98 + dy, width: 1.97, height: 3.7),
                           cornerWidth: 0.985, cornerHeight: 0.985, transform: nil)
            ctx.addPath(p)
            ctx.fillPath()
        }
        ctx.restoreGState()
    }

    override func mouseDown(with event: NSEvent) {
        pressed = true
        needsDisplay = true
    }

    override func mouseUp(with event: NSEvent) {
        pressed = false
        needsDisplay = true
        if bounds.contains(convert(event.locationInWindow, from: nil)) { onClick?() }
    }
}

final class DotPanel: NSPanel {
    let dotView = DotView()

    init() {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 44, height: 44),
                   styleMask: [.borderless, .nonactivatingPanel],
                   backing: .buffered, defer: true)
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        level = .floating
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        contentView = dotView
        dotView.toolTip = "NF で検品（押したときだけ、このウィンドウの答えを読みます）"
        dotView.setAccessibilityLabel("NF で検品")
        dotView.setAccessibilityRole(.button)
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}
