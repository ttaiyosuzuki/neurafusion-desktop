// 右下の丸の窓（DK-01）。常に前面・フォーカスを奪わない・全スペースに出る小さな透明の窓。
// 見た目は拡張の LivingMark（extension-kensan/content_script.js の makeLivingMark）と同じ
// 24×24 の図形を Core Graphics で描く: 青い丸・白いぼかしの輪・つやの楕円・目2つ。

import AppKit

private let lmBlue = NSColor(srgbRed: 0x3B / 255.0, green: 0x82 / 255.0, blue: 0xF6 / 255.0, alpha: 1)

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

        // 影
        ctx.setFillColor(NSColor.black.withAlphaComponent(0.1).cgColor)
        ctx.fillEllipse(in: CGRect(x: 12 - 5.4, y: 22.4 - 1.1, width: 10.8, height: 2.2))

        // 白いぼかしの輪（62%〜100% の間だけ色が乗る）
        let glowC = mix(lmBlue, .white, 0.75)
        let glow = CGGradient(colorsSpace: space,
                              colors: [glowC.withAlphaComponent(0).cgColor, glowC.withAlphaComponent(0).cgColor,
                                       glowC.withAlphaComponent(0.45).cgColor, glowC.withAlphaComponent(0).cgColor] as CFArray,
                              locations: [0, 0.62, 0.78, 1])!
        ctx.drawRadialGradient(glow, startCenter: CGPoint(x: 12, y: 12), startRadius: 0,
                               endCenter: CGPoint(x: 12, y: 12), endRadius: 11.6, options: [])

        // 本体（左上から光が当たる球）
        ctx.saveGState()
        ctx.addEllipse(in: CGRect(x: 3, y: 3, width: 18, height: 18))
        ctx.clip()
        let body = CGGradient(colorsSpace: space,
                              colors: [mix(lmBlue, .white, 0.6).cgColor, lmBlue.cgColor, mix(lmBlue, .black, 0.4).cgColor] as CFArray,
                              locations: [0, 0.5, 1])!
        let c = CGPoint(x: 3 + 18 * 0.42, y: 3 + 18 * 0.36)
        ctx.drawRadialGradient(body, startCenter: c, startRadius: 0, endCenter: c, endRadius: 18 * 0.72,
                               options: [.drawsAfterEndLocation])
        ctx.restoreGState()

        // つや
        ctx.saveGState()
        ctx.translateBy(x: 9, y: 7.6)
        ctx.rotate(by: -24 * .pi / 180)
        ctx.setFillColor(NSColor.white.withAlphaComponent(0.55).cgColor)
        ctx.fillEllipse(in: CGRect(x: -3.4, y: -2.2, width: 6.8, height: 4.4))
        ctx.restoreGState()

        // 目（押している間は少し下を見る）
        let dy: CGFloat = pressed ? 1.3 : 0
        ctx.setFillColor(NSColor.white.cgColor)
        for x in [8.1, 13.3] {
            let p = CGPath(roundedRect: CGRect(x: x, y: 9.9 + dy, width: 2.6, height: 5.2),
                           cornerWidth: 1.3, cornerHeight: 1.3, transform: nil)
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
