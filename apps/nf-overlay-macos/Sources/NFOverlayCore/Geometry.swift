// NF 右下の丸 — 位置の計算（DK-01）。座標はすべて左上原点・ポイント（AX と同じ）。
// Cocoa の窓（左下原点）へ置くときだけ `toCocoa` で変換する。

public struct Rect: Equatable, Sendable, Codable {
    public var x: Double
    public var y: Double
    public var w: Double
    public var h: Double

    public init(x: Double, y: Double, w: Double, h: Double) {
        self.x = x; self.y = y; self.w = w; self.h = h
    }

    public var maxX: Double { x + w }
    public var maxY: Double { y + h }

    public func contains(px: Double, py: Double) -> Bool {
        px >= x && px < maxX && py >= y && py < maxY
    }

    public func intersectionArea(_ o: Rect) -> Double {
        let ix = max(0, min(maxX, o.maxX) - max(x, o.x))
        let iy = max(0, min(maxY, o.maxY) - max(y, o.y))
        return ix * iy
    }
}

/// ウィンドウの右下の角が乗っている画面（無ければ一番重なりの大きい画面、それも無ければ先頭）。
public func screenFor(window: Rect, screens: [Rect]) -> Rect? {
    guard !screens.isEmpty else { return nil }
    let cx = window.maxX - 1
    let cy = window.maxY - 1
    if let s = screens.first(where: { $0.contains(px: cx, py: cy) }) { return s }
    let best = screens.max(by: { window.intersectionArea($0) < window.intersectionArea($1) })!
    if window.intersectionArea(best) > 0 { return best }
    return screens[0]
}

/// 丸の位置: ウィンドウの内側・右下から `margin` 離した所。ウィンドウが画面からはみ出していたら、
/// 丸が見える位置（そのウィンドウが乗っている画面の可視領域の中）に押し戻す。
/// ウィンドウが丸より小さいときは右下の角に揃える。
public func dotFrame(window: Rect, screens: [Rect], size: Double, margin: Double) -> Rect {
    var x = window.maxX - margin - size
    var y = window.maxY - margin - size
    // 小さすぎるウィンドウ: 左上にはみ出さない
    x = max(x, window.x)
    y = max(y, window.y)
    if let s = screenFor(window: window, screens: screens) {
        x = min(max(x, s.x), s.maxX - size)
        y = min(max(y, s.y), s.maxY - size)
    }
    return Rect(x: x, y: y, w: size, h: size)
}

/// 左上原点（AX）→ 左下原点（Cocoa）。`primaryHeight` はメニューバーのある主画面の高さ。
public func toCocoa(_ r: Rect, primaryHeight: Double) -> Rect {
    Rect(x: r.x, y: primaryHeight - r.y - r.h, w: r.w, h: r.h)
}

/// 左下原点（Cocoa の NSScreen.frame 等）→ 左上原点。
public func fromCocoa(_ r: Rect, primaryHeight: Double) -> Rect {
    Rect(x: r.x, y: primaryHeight - r.y - r.h, w: r.w, h: r.h)
}

/// 丸を押したときに開くパネルの位置: 丸の左上に広がる（画面の中に収める）。
public func panelFrame(dot: Rect, screens: [Rect], width: Double, height: Double, gap: Double = 8) -> Rect {
    var x = dot.maxX - width
    var y = dot.y - gap - height
    let s = screenFor(window: dot, screens: screens)
    if let s {
        if y < s.y { y = s.y } // 上に余白が無ければ画面の上端から
        x = min(max(x, s.x), s.maxX - width)
        y = min(y, s.maxY - height)
    }
    return Rect(x: x, y: y, w: width, h: height)
}
