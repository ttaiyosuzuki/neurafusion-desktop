"""前面のウィンドウに丸をついていかせる状態（X11）。Wayland では固定の位置を1回決めるだけ。

OS からは「前面がどれか」「枠がどこか」「最小化か」だけを受け取る（本文は受け取らない）。
同じ位置・同じ隠れ方は二度出さない（標準出力を無駄に流さない）。
"""

from __future__ import annotations

from dataclasses import dataclass

from . import protocol
from .geometry import Rect, place, place_fixed
from .protocol import AppConfig, OverlayConfig


@dataclass(frozen=True)
class WindowInfo:
    xid: int
    wm_names: tuple[str, ...]
    frame: Rect
    work_area: Rect
    minimized: bool = False


@dataclass(frozen=True)
class Decision:
    """丸をどうするか。dot が None なら隠す。line は Node へ出す1行（変わらなければ None）。"""

    dot: Rect | None
    app: str | None
    xid: int
    line: str | None


class FollowTracker:
    def __init__(self, config: OverlayConfig | None = None, scale: float = 1.0) -> None:
        self.config = config
        self.scale = scale
        self._current: WindowInfo | None = None
        self._last_key: tuple | None = None
        self.target: AppConfig | None = None
        self.dot: Rect | None = None

    def set_config(self, config: OverlayConfig) -> Decision | None:
        self.config = config
        self._last_key = None
        return self._decide() if self._current is not None else None

    def on_active(self, info: WindowInfo | None) -> Decision | None:
        """前面のウィンドウが変わった（None = 前面のウィンドウが無い）。"""
        self._current = info
        return self._decide()

    def on_geometry(self, xid: int, frame: Rect, minimized: bool = False, work_area: Rect | None = None) -> Decision | None:
        """追跡中のウィンドウが動いた・大きさが変わった・最小化された。別のウィンドウの通知は無視する。"""
        cur = self._current
        if cur is None or cur.xid != xid:
            return None
        self._current = WindowInfo(cur.xid, cur.wm_names, frame, work_area or cur.work_area, minimized)
        return self._decide()

    def _emit(self, key: tuple, dot: Rect | None, app: str | None, xid: int, line: str) -> Decision:
        self.dot = dot
        if key == self._last_key:
            return Decision(dot, app, xid, None)
        self._last_key = key
        return Decision(dot, app, xid, line)

    def _hide(self, reason: str, detail: str | None, app: str | None, xid: int = 0) -> Decision:
        self.target = None
        return self._emit(("hidden", reason, detail, app), None, app, xid, protocol.hidden(reason, detail, app))

    def _decide(self) -> Decision:
        cfg = self.config
        cur = self._current
        if cfg is None:
            return self._hide("disabled", "no-config", None)
        if not cfg.enabled:
            return self._hide("disabled", "all-off", None)
        if cur is None:
            return self._hide("no-window", None, None)
        app = cfg.match(cur.wm_names)
        if app is None:
            return self._hide("not-target", None, None, cur.xid)
        if not app.enabled:
            return self._hide("disabled", "app-off", app.id, cur.xid)
        if cur.minimized:
            return self._hide("no-window", "minimized", app.id, cur.xid)
        dot = place(cur.frame, cur.work_area, cfg.size, cfg.margin)
        if dot is None:
            return self._hide("no-window", "too-small", app.id, cur.xid)
        self.target = app
        key = ("geometry", app.id, cur.frame, dot)
        return self._emit(key, dot, app.id, cur.xid, protocol.geometry(app.id, cur.frame, dot, self.scale))


def fixed_decision(config: OverlayConfig | None, work_area: Rect, scale: float = 1.0) -> Decision:
    """Wayland: 画面の右下に固定。どのアプリが前面か分からないので app は "*"。
    アプリごとのオン・オフは効かせようがないので、全体のオン・オフ（config.enabled）だけで決める。"""
    if config is None or not config.enabled:
        return Decision(None, None, 0, protocol.hidden("disabled", "all-off" if config else "no-config"))
    dot = place_fixed(work_area, config.size, config.margin)
    if dot is None:
        return Decision(None, None, 0, protocol.hidden("no-window", "too-small"))
    return Decision(dot, "*", 0, protocol.geometry("*", work_area, dot, scale, fixed=True))
