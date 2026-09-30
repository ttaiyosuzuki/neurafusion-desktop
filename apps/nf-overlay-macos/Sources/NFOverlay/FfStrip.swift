// FF 先読み（Mac）— 半透明の行の窓。常に前面・フォーカスを奪わない・マウスを素通しにする。
// 主画面の下寄り中央に、手を1行ずつ足していく。画面共有から隠す設定は触らない（FF-07・src/ff/ff.test.ts が静的に見張る）。

import AppKit
import NFOverlayCore

@MainActor
final class FfStrip {
    private let panel: NSPanel
    private let stack = NSStackView()
    private let box = NSView()
    private let width: CGFloat = 560
    private let lineHeight: CGFloat = 24

    init() {
        panel = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 560, height: 40),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: true)
        panel.level = .statusBar
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.becomesKeyOnlyIfNeeded = true

        box.wantsLayer = true
        box.layer?.cornerRadius = 10
        box.layer?.backgroundColor = NSColor(white: 0.08, alpha: 0.85).cgColor
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 2
        stack.edgeInsets = NSEdgeInsets(top: 8, left: 14, bottom: 8, right: 14)
        stack.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: box.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: box.trailingAnchor),
            stack.topAnchor.constraint(equalTo: box.topAnchor),
        ])
        panel.contentView = box
    }

    var isVisible: Bool { panel.isVisible }

    /// 行をそろえて出し、画面に描き終えるまで待つ（ff-drawn の時刻はこの後に取る）
    func show(lines: [FfLine], opacity: Double) {
        for v in stack.arrangedSubviews {
            stack.removeArrangedSubview(v)
            v.removeFromSuperview()
        }
        for l in lines {
            let f = NSTextField(labelWithString: l.text)
            f.font = .monospacedSystemFont(ofSize: 13, weight: l.kind == .move ? .medium : .regular)
            f.textColor = l.kind == .move ? .white : NSColor(white: 0.78, alpha: 1)
            f.lineBreakMode = .byTruncatingTail
            f.maximumNumberOfLines = 1
            f.widthAnchor.constraint(lessThanOrEqualToConstant: width - 28).isActive = true
            stack.addArrangedSubview(f)
        }
        let h = CGFloat(max(lines.count, 1)) * lineHeight + 16
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let frame = NSRect(x: screen.midX - width / 2, y: screen.minY + screen.height * 0.18, width: width, height: h)
        panel.alphaValue = CGFloat(min(0.95, max(0.3, opacity)))
        panel.setFrame(frame, display: false)
        panel.orderFrontRegardless() // 前面に出すが、キーの窓にはならない（.nonactivatingPanel）
        box.needsLayout = true
        panel.displayIfNeeded()
        CATransaction.flush()
    }

    func hide() {
        panel.orderOut(nil)
    }
}
