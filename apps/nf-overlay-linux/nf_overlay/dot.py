"""丸の窓（GTK 3）。ブラウザ拡張・Mac 版と同じ絵柄（青い球・つや・白い目）を cairo で描く。

- 枠なし・透明な背景・タスクバーに出さない・フォーカスを取らない（押しても AI アプリの入力欄から外れない）
- X11 では override-redirect（POPUP）で出す。ウィンドウマネージャーを通さずに指定の位置に置け、通常の窓より上に出る
- Wayland のセッションでは、この窓は XWayland で出す（app.py が GDK_BACKEND=x11 にする）
"""

from __future__ import annotations

import math
from typing import Callable

import cairo
import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, Gtk  # noqa: E402

LM_BLUE = (0x3B / 255, 0x82 / 255, 0xF6 / 255)


def _mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


class DotWindow(Gtk.Window):
    def __init__(self, on_click: Callable[[int], None]) -> None:
        super().__init__(type=Gtk.WindowType.POPUP)
        self._on_click = on_click
        self._pressed = False
        self._size = 44
        self.set_app_paintable(True)
        self.set_decorated(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_accept_focus(False)
        self.set_focus_on_map(False)
        self.set_keep_above(True)
        self.set_type_hint(Gdk.WindowTypeHint.UTILITY)
        self.set_title("NeuraFusion")
        visual = self.get_screen().get_rgba_visual()
        if visual is not None:
            self.set_visual(visual)
        self.add_events(Gdk.EventMask.BUTTON_PRESS_MASK | Gdk.EventMask.BUTTON_RELEASE_MASK)
        self.connect("draw", self._draw)
        self.connect("button-press-event", self._press)
        self.connect("button-release-event", self._release)
        self.set_tooltip_text("NeuraFusion — 押すと、この画面の答えを検品します")

    def show_at(self, x: int, y: int, size: int) -> None:
        if size != self._size:
            self._size = size
        self.resize(size, size)
        self.move(x, y)
        # 丸の外は押せないように（四隅の透明な所はその下の窓へ）
        region = cairo.Region(cairo.RectangleInt(0, 0, size, size))
        self.input_shape_combine_region(region)
        self.show_all()
        gw = self.get_window()
        if gw is not None:
            gw.raise_()

    def _press(self, _w, ev) -> bool:
        if ev.button == 1:
            self._pressed = True
            self.queue_draw()
        return True

    def _release(self, _w, ev) -> bool:
        if ev.button == 1 and self._pressed:
            self._pressed = False
            self.queue_draw()
            alloc = self.get_allocation()
            if 0 <= ev.x <= alloc.width and 0 <= ev.y <= alloc.height:
                # 押した時刻は、あとで出す同意の小窓に渡す（丸はフォーカスを取らないので、時刻が無いと
                # ウィンドウマネージャーがフォーカスを断り、小窓は後ろ・「準備ができました」の通知になる）
                self._on_click(ev.time)
        return True

    def _draw(self, _w, ctx: cairo.Context) -> bool:
        ctx.set_operator(cairo.OPERATOR_SOURCE)
        ctx.set_source_rgba(0, 0, 0, 0)
        ctx.paint()
        ctx.set_operator(cairo.OPERATOR_OVER)
        alloc = self.get_allocation()
        s = min(alloc.width, alloc.height) / 24
        ctx.save()
        ctx.scale(s, s)
        # 影
        ctx.save()
        ctx.translate(12, 22.4)
        ctx.scale(5.4, 1.1)
        ctx.arc(0, 0, 1, 0, 2 * math.pi)
        ctx.restore()
        ctx.set_source_rgba(0, 0, 0, 0.1)
        ctx.fill()
        # 白いぼかしの輪
        gc = _mix(LM_BLUE, (1, 1, 1), 0.75)
        glow = cairo.RadialGradient(12, 12, 0, 12, 12, 11.6)
        glow.add_color_stop_rgba(0, *gc, 0)
        glow.add_color_stop_rgba(0.62, *gc, 0)
        glow.add_color_stop_rgba(0.78, *gc, 0.45)
        glow.add_color_stop_rgba(1, *gc, 0)
        ctx.set_source(glow)
        ctx.arc(12, 12, 11.6, 0, 2 * math.pi)
        ctx.fill()
        # 本体（左上から光が当たる球）
        cx, cy = 3 + 18 * 0.42, 3 + 18 * 0.36
        body = cairo.RadialGradient(cx, cy, 0, cx, cy, 18 * 0.72)
        body.add_color_stop_rgb(0, *_mix(LM_BLUE, (1, 1, 1), 0.6))
        body.add_color_stop_rgb(0.5, *LM_BLUE)
        body.add_color_stop_rgb(1, *_mix(LM_BLUE, (0, 0, 0), 0.4))
        body.set_extend(cairo.EXTEND_PAD)
        ctx.set_source(body)
        ctx.arc(12, 12, 9, 0, 2 * math.pi)
        ctx.fill()
        # つや
        ctx.save()
        ctx.translate(9, 7.6)
        ctx.rotate(-24 * math.pi / 180)
        ctx.scale(3.4, 2.2)
        ctx.arc(0, 0, 1, 0, 2 * math.pi)
        ctx.restore()
        ctx.set_source_rgba(1, 1, 1, 0.55)
        ctx.fill()
        # 目（押している間は少し下を見る）
        dy = 1.3 if self._pressed else 0
        ctx.set_source_rgb(1, 1, 1)
        for x in (8.1, 13.3):
            _rounded(ctx, x, 9.9 + dy, 2.6, 5.2, 1.3)
            ctx.fill()
        ctx.restore()
        return True


def _rounded(ctx, x, y, w, h, r):
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    ctx.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
    ctx.close_path()
