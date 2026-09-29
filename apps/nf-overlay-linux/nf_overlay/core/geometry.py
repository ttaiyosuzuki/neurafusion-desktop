"""丸の位置の計算（X11: ウィンドウの右下／Wayland: 作業領域の右下に固定）。座標は左上原点の論理ピクセル。"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rect:
    x: int
    y: int
    w: int
    h: int

    @property
    def right(self) -> int:
        return self.x + self.w

    @property
    def bottom(self) -> int:
        return self.y + self.h

    @property
    def empty(self) -> bool:
        return self.w <= 0 or self.h <= 0

    def intersects(self, o: "Rect") -> bool:
        return not self.empty and not o.empty and self.x < o.right and o.x < self.right and self.y < o.bottom and o.y < self.bottom

    def scaled(self, s: float) -> "Rect":
        return Rect(round(self.x * s), round(self.y * s), round(self.w * s), round(self.h * s))


def place(frame: Rect, work_area: Rect, size: int, margin: int) -> Rect | None:
    """ウィンドウの右下の内側に丸を置く。小さすぎる・ほぼ画面外なら None（丸を隠す）。Windows の BubbleLayout と同じ規則。"""
    if frame.empty or work_area.empty:
        return None
    size = max(1, size)
    margin = max(0, margin)
    if frame.w < size + 2 * margin or frame.h < size + 2 * margin:
        return None
    x = frame.right - margin - size
    y = frame.bottom - margin - size
    x = min(max(x, work_area.x), max(work_area.x, work_area.right - size))
    y = min(max(y, work_area.y), max(work_area.y, work_area.bottom - size))
    dot = Rect(x, y, size, size)
    return dot if dot.intersects(frame) else None


def place_fixed(work_area: Rect, size: int, margin: int) -> Rect | None:
    """Wayland: 他のアプリの位置は取れないので、作業領域（パネル・ドックを除いた画面）の右下に固定する。"""
    return place(work_area, work_area, size, margin)
