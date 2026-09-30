"""FF 先読みの行の窓（GTK 3）。主画面の作業領域の下寄り中央に、半透明の行を1行ずつ出す。

- POPUP（override-redirect）・常に前面・フォーカスを取らない（入力中のアプリから外さない）・タスクバーに出さない
- マウスは素通し（入力の形を空にする）
- 半透明: 窓全体の不透明度（set_opacity。合成のある画面で効く）。背景は RGBA の見た目で角の丸い暗い帯
- 画面共有から隠す API は使わない（FF-07）
- 描いたら（draw の後、描いた分を X へ送り出してから）on_drawn(time.monotonic()) を呼ぶ。ff-drawn.ms はここで測る
"""

from __future__ import annotations

import math
import time
from typing import Callable

import cairo
import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
gi.require_version("Pango", "1.0")
from gi.repository import Gdk, GLib, Gtk, Pango  # noqa: E402

from .core import ff  # noqa: E402
from .core.geometry import Rect  # noqa: E402

# 画面の下端からの隙間
BOTTOM_GAP = 72
MAX_WIDTH_CHARS = 72

_CSS = b"""
.nf-ff-strip label { font: 14px system-ui, sans-serif; color: #f5f7fa; }
.nf-ff-strip label.nf-ff-none, .nf-ff-strip label.nf-ff-info { color: #b8c0cc; }
"""


class FfStrip(Gtk.Window):
    def __init__(self, on_drawn: Callable[[float], None]) -> None:
        super().__init__(type=Gtk.WindowType.POPUP)
        self._on_drawn = on_drawn
        self._report_queued = False
        self.set_app_paintable(True)
        self.set_decorated(False)
        self.set_skip_taskbar_hint(True)
        self.set_skip_pager_hint(True)
        self.set_accept_focus(False)
        self.set_focus_on_map(False)
        self.set_keep_above(True)
        self.set_type_hint(Gdk.WindowTypeHint.NOTIFICATION)
        self.set_title("NeuraFusion 先読み")
        visual = self.get_screen().get_rgba_visual()
        if visual is not None:
            self.set_visual(visual)
        self.get_style_context().add_class("nf-ff-strip")
        prov = Gtk.CssProvider()
        prov.load_from_data(_CSS)
        Gtk.StyleContext.add_provider_for_screen(self.get_screen(), prov, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        self._box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        self._box.set_margin_top(8)
        self._box.set_margin_bottom(8)
        self._box.set_margin_start(14)
        self._box.set_margin_end(14)
        self.add(self._box)
        # マウスを素通しにする（空の入力の形）
        self.input_shape_combine_region(cairo.Region())
        self.connect("realize", lambda _w: self.input_shape_combine_region(cairo.Region()))
        self.connect("draw", self._draw_bg)
        self.connect_after("draw", self._after_draw)
        self.set_opacity(ff.OPACITY_DEFAULT)

    def set_level(self, opacity: float) -> None:
        self.set_opacity(max(ff.OPACITY_MIN, min(ff.OPACITY_MAX, opacity)))

    def show_lines(self, lines: list[ff.FfLine], work_area: Rect) -> None:
        for child in self._box.get_children():
            self._box.remove(child)
        for ln in lines:
            lab = Gtk.Label(label=ln.text)
            lab.set_xalign(0)
            lab.set_single_line_mode(True)
            lab.set_max_width_chars(MAX_WIDTH_CHARS)
            lab.set_ellipsize(Pango.EllipsizeMode.END)
            lab.get_style_context().add_class(f"nf-ff-{ln.kind}")
            self._box.pack_start(lab, False, False, 0)
        self._box.show_all()
        _min, nat = self.get_preferred_size()
        w, h = max(1, nat.width), max(1, nat.height)
        self.resize(w, h)
        x = work_area.x + max(0, (work_area.w - w) // 2)
        y = work_area.y + max(0, work_area.h - h - BOTTOM_GAP)
        self.move(x, y)
        if not self.get_visible():
            self.show_all()
        gw = self.get_window()
        if gw is not None:
            gw.raise_()
        self.queue_draw()

    def hide_strip(self) -> None:
        self.hide()
        for child in self._box.get_children():
            self._box.remove(child)

    # ---- 描く ----
    def _draw_bg(self, _w, ctx: cairo.Context) -> bool:
        ctx.set_operator(cairo.OPERATOR_SOURCE)
        ctx.set_source_rgba(0, 0, 0, 0)
        ctx.paint()
        ctx.set_operator(cairo.OPERATOR_OVER)
        alloc = self.get_allocation()
        _rounded(ctx, 0, 0, alloc.width, alloc.height, 10)
        ctx.set_source_rgba(0.08, 0.09, 0.11, 0.92)
        ctx.fill()
        # False: このあと子（行のラベル）を描く
        return False

    def _after_draw(self, _w, _ctx) -> bool:
        if not self._report_queued:
            self._report_queued = True
            GLib.idle_add(self._report)
        return False

    def _report(self) -> bool:
        # 描いた分をこの時点で X へ送り出してから時刻を取る（フレームの描画が終わった後の空き時間に来る）
        self._report_queued = False
        disp = Gdk.Display.get_default()
        if disp is not None:
            disp.flush()
        if self.get_visible():
            self._on_drawn(time.monotonic())
        return False


def _rounded(ctx, x, y, w, h, r):
    ctx.new_sub_path()
    ctx.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    ctx.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    ctx.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    ctx.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
    ctx.close_path()
