"""丸の窓（GTK 3）。NF の丸（Mac 版・Web と同じ。左下 黄 → 右上 紫の4色・中心が濃く外へ白・白ふち・白い目）を cairo で描く。
2026-10-02 見た目③ icon-apps-main で青い球・つや・影から替えた（原画 neurafusion-repo design/icon-gradient/nf-mark-gradient.svg）。

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

# hsl(45 97% 54%)・hsl(24 97% 54%)・hsl(335 90% 57%)・hsl(275 80% 56%)（Web の COMPLETE_STOPS）を sRGB に
MARK_STOPS = (
    (0.0, (0xFB / 255, 0xC3 / 255, 0x18 / 255)),
    (0.36, (0xFB / 255, 0x73 / 255, 0x18 / 255)),
    (0.68, (0xF4 / 255, 0x2F / 255, 0x81 / 255)),
    (1.0, (0x9E / 255, 0x35 / 255, 0xE9 / 255)),
)
# 光の輪の色（桃 hsl(335 90% 57%)＝Web の COMPLETE_HALO）
HALO = (0xF4 / 255, 0x2F / 255, 0x81 / 255)
# 原画の白の重ね（中心が濃く外へ白）
WHITE_STOPS = ((0, 0), (0.2, 0.04), (0.4, 0.10), (0.55, 0.15), (0.65, 0.19), (0.75, 0.27), (0.85, 0.37), (1, 0.45))


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
        # 光の輪
        gc = _mix(HALO, (1, 1, 1), 0.75)
        glow = cairo.RadialGradient(12, 12, 0, 12, 12, 11.6)
        glow.add_color_stop_rgba(0, *gc, 0)
        glow.add_color_stop_rgba(0.62, *gc, 0)
        glow.add_color_stop_rgba(0.78, *gc, 0.45)
        glow.add_color_stop_rgba(1, *gc, 0)
        ctx.set_source(glow)
        ctx.arc(12, 12, 11.6, 0, 2 * math.pi)
        ctx.fill()
        # 本体（左下 黄 → 右上 紫）。原画の objectBoundingBox を 3..21 の座標に直した
        body = cairo.LinearGradient(3 + 18 * 0.18, 3 + 18 * 0.82, 3 + 18 * 0.82, 3 + 18 * 0.18)
        for off, rgb in MARK_STOPS:
            body.add_color_stop_rgb(off, *rgb)
        body.set_extend(cairo.EXTEND_PAD)
        ctx.set_source(body)
        ctx.arc(12, 12, 9, 0, 2 * math.pi)
        ctx.fill()
        # 白の重ね（中心が濃く外へ白）
        white = cairo.RadialGradient(12, 3 + 18 * 0.44, 0, 12, 3 + 18 * 0.44, 18 * 0.56)
        for off, a in WHITE_STOPS:
            white.add_color_stop_rgba(off, 1, 1, 1, a)
        white.set_extend(cairo.EXTEND_PAD)
        ctx.set_source(white)
        ctx.arc(12, 12, 9, 0, 2 * math.pi)
        ctx.fill()
        # 白ふち
        rim = cairo.RadialGradient(12, 12, 0, 12, 12, 9)
        rim.add_color_stop_rgba(0, 1, 1, 1, 0)
        rim.add_color_stop_rgba(0.93, 1, 1, 1, 0)
        rim.add_color_stop_rgba(0.97, 1, 1, 1, 0.42)
        rim.add_color_stop_rgba(1, 1, 1, 1, 0.85)
        ctx.set_source(rim)
        ctx.arc(12, 12, 9, 0, 2 * math.pi)
        ctx.fill()
        # 目（押している間は少し下を見る）
        dy = 1.3 if self._pressed else 0
        ctx.set_source_rgb(1, 1, 1)
        for x in (8.37, 13.66):
            _rounded(ctx, x, 7.98 + dy, 1.97, 3.7, 0.985)
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
