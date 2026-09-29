"""X11: 前面のウィンドウと、その枠の位置・大きさ・最小化だけを見る（libwnck）。本文は見ない。

受け取る通知は「前面が変わった」（_NET_ACTIVE_WINDOW）と、前面のウィンドウ1つの「枠が変わった」「状態が変わった」だけ。
GTK のクライアント側の飾り（CSD）の窓は、見えない影の分（_GTK_FRAME_EXTENTS）を枠から引く。
"""

from __future__ import annotations

import os
from typing import Callable

import gi

gi.require_version("Gdk", "3.0")
gi.require_version("GdkX11", "3.0")
gi.require_version("Wnck", "3.0")
from gi.repository import Gdk, GdkX11, Wnck  # noqa: E402

from .core.follow import WindowInfo
from .core.geometry import Rect


def _frame_extents(xid: int) -> tuple[int, int, int, int]:
    """_GTK_FRAME_EXTENTS（左・右・上・下）。無ければ 0。"""
    try:
        disp = Gdk.Display.get_default()
        gw = GdkX11.X11Window.foreign_new_for_display(disp, xid)
        if gw is None:
            return (0, 0, 0, 0)
        ok, _t, _f, data = Gdk.property_get(
            gw, Gdk.Atom.intern("_GTK_FRAME_EXTENTS", False), Gdk.Atom.intern("CARDINAL", False), 0, 16, False
        )
        if not ok or not data:
            return (0, 0, 0, 0)
        # 32 ビットの値は C の long（64 ビット環境では 8 バイト）で並ぶ
        width = 8 if len(data) >= 32 else 4
        vals = [int.from_bytes(bytes(data[i : i + width]), "little") for i in range(0, width * 4, width)]
        return (vals[0], vals[1], vals[2], vals[3])
    except Exception:  # noqa: BLE001
        return (0, 0, 0, 0)


def _work_area_for(frame: Rect) -> Rect:
    disp = Gdk.Display.get_default()
    cx, cy = frame.x + frame.w // 2, frame.y + frame.h // 2
    mon = disp.get_monitor_at_point(cx, cy) or disp.get_primary_monitor() or disp.get_monitor(0)
    wa = mon.get_workarea()
    return Rect(wa.x, wa.y, wa.width, wa.height)


class X11Watcher:
    def __init__(self, on_active: Callable[[WindowInfo | None], None], on_geometry: Callable[[int, Rect, bool, Rect], None]) -> None:
        self._on_active = on_active
        self._on_geometry = on_geometry
        self._screen = Wnck.Screen.get_default()
        self._cur: Wnck.Window | None = None
        self._handlers: list[int] = []
        self._own_pid = os.getpid()
        self._started = False

    def start(self) -> None:
        """config を受け取ってから呼ぶ（受け取るまで前面の追跡を始めない）。"""
        if self._started:
            return
        self._started = True
        self._screen.force_update()
        self._screen.connect("active-window-changed", lambda *_a: self._active_changed())
        self._active_changed()

    def window_pid(self, xid: int) -> int:
        w = Wnck.Window.get(xid)
        return w.get_pid() if w is not None else 0

    def window_title(self, xid: int) -> str:
        w = Wnck.Window.get(xid)
        return (w.get_name() or "") if w is not None else ""

    def capture_rect(self, xid: int) -> tuple[int, int, int, int]:
        """撮る範囲（そのウィンドウの中の座標）。見えない影の分を除いた中身だけ。"""
        w = Wnck.Window.get(xid)
        if w is None:
            return (0, 0, 0, 0)
        _x, _y, width, height = w.get_client_window_geometry()
        left, right, top, bottom = _frame_extents(xid)
        return (left, top, max(1, width - left - right), max(1, height - top - bottom))

    def current_frame(self) -> Rect | None:
        return self._frame(self._cur) if self._cur is not None else None

    def _frame(self, w: Wnck.Window) -> Rect:
        x, y, width, height = w.get_client_window_geometry()
        left, right, top, bottom = _frame_extents(w.get_xid())
        return Rect(x + left, y + top, max(0, width - left - right), max(0, height - top - bottom))

    def _info(self, w: Wnck.Window) -> WindowInfo:
        frame = self._frame(w)
        names = (w.get_class_instance_name() or "", w.get_class_group_name() or "")
        return WindowInfo(w.get_xid(), names, frame, _work_area_for(frame), w.is_minimized())

    def _disconnect(self) -> None:
        if self._cur is not None:
            for h in self._handlers:
                try:
                    self._cur.disconnect(h)
                except Exception:  # noqa: BLE001
                    pass
        self._handlers = []
        self._cur = None

    def _active_changed(self) -> None:
        w = self._screen.get_active_window()
        # 自分の窓（丸・パネル・同意の小窓）が前面になっても、前の対象のままにする
        if w is not None and w.get_pid() == self._own_pid:
            return
        self._disconnect()
        if w is None or w.get_window_type() in (Wnck.WindowType.DESKTOP, Wnck.WindowType.DOCK):
            self._on_active(None)
            return
        self._cur = w
        self._handlers = [
            w.connect("geometry-changed", lambda win: self._geometry_changed(win)),
            w.connect("state-changed", lambda win, *_a: self._geometry_changed(win)),
        ]
        self._on_active(self._info(w))

    def _geometry_changed(self, w: Wnck.Window) -> None:
        if w is not self._cur:
            return
        frame = self._frame(w)
        self._on_geometry(w.get_xid(), frame, w.is_minimized(), _work_area_for(frame))
