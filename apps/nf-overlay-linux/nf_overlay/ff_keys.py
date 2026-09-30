"""FF 先読みの全体キー（docs/overlay-protocol.md「FF 先読み」）。

キーの範囲（ff-config の scopes。既定は trigger が "global"、adopt・close が "overlay-only"）:
- X11: libX11 を ctypes で直接使う（GDK とは別の X の接続を1本開く）。ルートウィンドウに XGrabKey で global のキーを取り、
  その接続の fd を GLib で見てキーの知らせを読む。overlay-only のキー（adopt・Esc の close）は行が出ている間だけ取り、
  隠したら XUngrabKey で外す（他のアプリから奪わない）。他のアプリが先に取っているキーは BadAccess になるので、
  X のエラーの受け口で拾って ff-keys の failed に入れる（そのとき取ろうとしたキーの分）。
  libX11 は使うときに初めて読む（X の無い所でも import できる）。
- Wayland: xdg-desktop-portal の GlobalShortcuts（CreateSession → BindShortcuts に preferred_trigger → Activated の信号）。
  ポータルは「表示中だけ」の登録ができず、登録したキーはデスクトップが常に取る。Esc・Alt+Shift+. を他のアプリから
  奪わないよう、global のキーだけ登録する。overlay-only のキー（既定は adopt・close）は登録せず、ff-config のあと
  1回だけ ff-keys の failed で知らせる（行を出すたびには試さない。core/ff.py の key_plan）。
  ポータルに無ければ全部を失敗として知らせ、標準エラーに診断を1行出す（本文は出さない）。

キーを受けたら、真っ先に time.monotonic() を控える（ff-drawn.ms の起点）。
"""

from __future__ import annotations

import ctypes
import ctypes.util
import os
import time
from typing import Any, Callable

from gi.repository import Gio, GLib

from .core import ff

# (action, 受けた時刻 = time.monotonic())
OnKey = Callable[[str, float], None]
# (ok, failed)
OnResult = Callable[[bool, list[str]], None]
Diag = Callable[[str], None]


# ---------------- X11（libX11 を ctypes で） ----------------

KEY_PRESS = 2
KEY_RELEASE = 3
GRAB_MODE_ASYNC = 1
BAD_ACCESS = 10


class _XErrorEvent(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("display", ctypes.c_void_p),
        ("resourceid", ctypes.c_ulong),
        ("serial", ctypes.c_ulong),
        ("error_code", ctypes.c_ubyte),
        ("request_code", ctypes.c_ubyte),
        ("minor_code", ctypes.c_ubyte),
    ]


class _XKeyEvent(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("serial", ctypes.c_ulong),
        ("send_event", ctypes.c_int),
        ("display", ctypes.c_void_p),
        ("window", ctypes.c_ulong),
        ("root", ctypes.c_ulong),
        ("subwindow", ctypes.c_ulong),
        ("time", ctypes.c_ulong),
        ("x", ctypes.c_int),
        ("y", ctypes.c_int),
        ("x_root", ctypes.c_int),
        ("y_root", ctypes.c_int),
        ("state", ctypes.c_uint),
        ("keycode", ctypes.c_uint),
        ("same_screen", ctypes.c_int),
    ]


class _XEvent(ctypes.Union):
    # XEvent は long 24 個分の共用体
    _fields_ = [("type", ctypes.c_int), ("xkey", _XKeyEvent), ("pad", ctypes.c_long * 24)]


_ERROR_HANDLER = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.POINTER(_XErrorEvent))


def _load_x11() -> Any:
    name = ctypes.util.find_library("X11") or "libX11.so.6"
    x = ctypes.CDLL(name)
    x.XOpenDisplay.argtypes = [ctypes.c_char_p]
    x.XOpenDisplay.restype = ctypes.c_void_p
    x.XCloseDisplay.argtypes = [ctypes.c_void_p]
    x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
    x.XDefaultRootWindow.restype = ctypes.c_ulong
    x.XConnectionNumber.argtypes = [ctypes.c_void_p]
    x.XConnectionNumber.restype = ctypes.c_int
    x.XStringToKeysym.argtypes = [ctypes.c_char_p]
    x.XStringToKeysym.restype = ctypes.c_ulong
    x.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    x.XKeysymToKeycode.restype = ctypes.c_ubyte
    x.XGrabKey.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_uint, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_int]
    x.XUngrabKey.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_uint, ctypes.c_ulong]
    x.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
    x.XFlush.argtypes = [ctypes.c_void_p]
    x.XPending.argtypes = [ctypes.c_void_p]
    x.XPending.restype = ctypes.c_int
    x.XNextEvent.argtypes = [ctypes.c_void_p, ctypes.POINTER(_XEvent)]
    x.XSetErrorHandler.argtypes = [ctypes.c_void_p]
    x.XSetErrorHandler.restype = ctypes.c_void_p
    x.XkbSetDetectableAutoRepeat.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_int)]
    x.XkbSetDetectableAutoRepeat.restype = ctypes.c_int
    return x


class X11Keys:
    """X11 の全体キー。主スレッド（GLib）だけから使う。"""

    def __init__(self, on_key: OnKey, diag: Diag) -> None:
        self._on_key = on_key
        self._diag = diag
        self._x: Any = None
        self._dpy: int | None = None
        self._root = 0
        self._watch = 0
        # action → 取った (keycode, mask) の組
        self._grabbed: dict[str, list[tuple[int, int]]] = {}
        # (keycode, CapsLock・NumLock を除いた mask) → action
        self._map: dict[tuple[int, int], str] = {}
        self._down: set[int] = set()
        self._cfg: ff.FfConfig | None = None
        self._plan = ff.KeyPlan()
        self._overlay_on = False
        self._errors: list[int] = []

    # ---- 開く ----
    def _open(self) -> bool:
        if self._dpy:
            return True
        try:
            self._x = _load_x11()
        except OSError:
            self._diag("FF: libX11 を読めません（全体キーを登録できません）")
            return False
        dpy = self._x.XOpenDisplay(None)
        if not dpy:
            self._diag("FF: X につながれません（全体キーを登録できません）")
            return False
        self._dpy = dpy
        self._root = self._x.XDefaultRootWindow(dpy)
        # 押しっぱなしの自動の繰り返しで、押下の番号が進み続けないように（離すまでの KeyPress は読み飛ばす）
        supported = ctypes.c_int(0)
        self._x.XkbSetDetectableAutoRepeat(dpy, 1, ctypes.byref(supported))
        ch = GLib.IOChannel.unix_new(self._x.XConnectionNumber(dpy))
        ch.set_encoding(None)
        ch.set_buffered(False)
        self._watch = GLib.io_add_watch(ch, GLib.PRIORITY_HIGH, GLib.IOCondition.IN, self._on_readable)
        return True

    # ---- X のエラーの受け口（登録の間だけ差し替える。Xlib の受け口はプロセスに1つなので、GDK の分は元へ回す） ----
    def _with_errors(self, fn: Callable[[], None]) -> list[int]:
        x = self._x
        self._errors = []
        prev_box: dict[str, Any] = {}

        def handler(dpy, ev) -> int:
            if dpy == self._dpy:
                self._errors.append(int(ev.contents.error_code))
                return 0
            prev = prev_box.get("fn")
            return int(prev(dpy, ev)) if prev is not None else 0

        cb = _ERROR_HANDLER(handler)
        prev_ptr = x.XSetErrorHandler(ctypes.cast(cb, ctypes.c_void_p))
        if prev_ptr:
            prev_box["fn"] = _ERROR_HANDLER(prev_ptr)
        try:
            fn()
            x.XSync(self._dpy, 0)
        finally:
            x.XSetErrorHandler(prev_ptr)
        return list(self._errors)

    # ---- 取る・外す ----
    def _grab(self, action: str, chord: ff.Chord) -> bool:
        x, dpy = self._x, self._dpy
        name = chord.keysym_name()
        keysym = x.XStringToKeysym(name.encode("ascii")) if name else 0
        keycode = x.XKeysymToKeycode(dpy, keysym) if keysym else 0
        if not keycode:
            return False
        done: list[tuple[int, int]] = []
        base_failed = False
        for i, (_n, mask) in enumerate(chord.x11_grabs()):
            errs = self._with_errors(lambda m=mask: x.XGrabKey(dpy, keycode, m, self._root, 1, GRAB_MODE_ASYNC, GRAB_MODE_ASYNC))
            if errs:
                if i == 0:
                    base_failed = True
                    break
                # CapsLock・NumLock 付きの組だけ取れないのは続ける（素の組は効く）
                continue
            done.append((keycode, mask))
        if base_failed:
            for kc, m in done:
                x.XUngrabKey(dpy, kc, m, self._root)
            x.XFlush(dpy)
            return False
        self._grabbed[action] = done
        self._map[(keycode, ff.clean_mask(chord.mask()))] = action
        # XSync で先に読み込まれた知らせは fd では気づけないので、後で読む
        GLib.idle_add(self._drain)
        return True

    def _ungrab(self, action: str) -> None:
        pairs = self._grabbed.pop(action, None)
        if not pairs or not self._dpy:
            return
        for kc, m in pairs:
            self._x.XUngrabKey(self._dpy, kc, m, self._root)
        self._map = {k: a for k, a in self._map.items() if a != action}
        self._x.XFlush(self._dpy)

    def _grab_all(self, actions: tuple[str, ...]) -> list[str]:
        """actions を取る。取れなかった action を返す（読めないキー・他のアプリが先に取っているキー）。"""
        cfg = self._cfg
        if not actions:
            return []
        if cfg is None or not self._open():
            return list(actions)
        failed = [a for a in actions if cfg.keys.get(a) is None or not self._grab(a, cfg.keys[a])]
        if failed:
            self._diag(f"FF: キーを登録できませんでした（{', '.join(failed)}。他のアプリが先に取っている・読めないキー）")
        return failed

    def apply(self, cfg: ff.FfConfig, done: OnResult, overlay: bool = False) -> None:
        """ff-config のたび。global のキーを取り直す。overlay（行が出ている）なら overlay-only のキーも取る。"""
        for a in list(self._grabbed):
            self._ungrab(a)
        self._cfg = cfg
        self._plan = ff.key_plan(cfg, "x11")
        self._overlay_on = False
        if not cfg.enabled:
            done(True, [])
            return
        failed = self._grab_all(self._plan.at_config)
        if overlay:
            self._overlay_on = True
            failed += self._grab_all(self._plan.while_visible)
        done(not failed, failed)

    def set_overlay(self, want: bool) -> list[str] | None:
        """overlay-only のキーを取る・外す。取ろうとしたときだけ、取れなかった action を返す（それ以外は None）。"""
        cfg = self._cfg
        if cfg is None or not cfg.enabled:
            return None
        if want and not self._overlay_on:
            self._overlay_on = True
            return self._grab_all(self._plan.while_visible)
        if not want and self._overlay_on:
            self._overlay_on = False
            for a in self._plan.while_visible:
                self._ungrab(a)
        return None

    def stop(self) -> None:
        for a in list(self._grabbed):
            self._ungrab(a)
        if self._watch:
            GLib.source_remove(self._watch)
            self._watch = 0
        if self._dpy:
            self._x.XCloseDisplay(self._dpy)
            self._dpy = None

    # ---- 知らせを読む ----
    def _on_readable(self, _ch, _cond) -> bool:
        self._drain()
        return True

    def _drain(self) -> bool:
        x, dpy = self._x, self._dpy
        if not dpy:
            return False
        ev = _XEvent()
        while x.XPending(dpy) > 0:
            x.XNextEvent(dpy, ctypes.byref(ev))
            if ev.type == KEY_PRESS:
                t = time.monotonic()
                k = ev.xkey
                if k.keycode in self._down:
                    continue
                action = self._map.get((k.keycode, ff.clean_mask(k.state)))
                if action is None:
                    continue
                self._down.add(k.keycode)
                self._on_key(action, t)
            elif ev.type == KEY_RELEASE:
                self._down.discard(ev.xkey.keycode)
        return False


# ---------------- Wayland（xdg-desktop-portal の GlobalShortcuts） ----------------

PORTAL_BUS = "org.freedesktop.portal.Desktop"
PORTAL_PATH = "/org/freedesktop/portal/desktop"
GS_IFACE = "org.freedesktop.portal.GlobalShortcuts"
_DESCRIPTIONS = {
    "trigger": "NeuraFusion 先読みを出す",
    "adopt": "NeuraFusion 先読みの手で行く",
    "close": "NeuraFusion 先読みを閉じる",
}
# 起動直後のポータルは最初の応答に 20 秒ほどかかることがある（VM で実測）
_VERSION_TIMEOUT_MS = 30000
# BindShortcuts は本人の確認の画面が出ることがある
_BIND_TIMEOUT_S = 180


class PortalKeys:
    """Wayland の全体キー。ポータルとのやりとりはすべて非同期（主ループを止めない）。"""

    def __init__(self, on_key: OnKey, diag: Diag) -> None:
        self._on_key = on_key
        self._diag = diag
        self._bus: Gio.DBusConnection | None = None
        self._proxy: Gio.DBusProxy | None = None
        self._session: str | None = None
        self._gen = 0
        self._n = 0
        self._plan = ff.KeyPlan()

    def _fail(self, done: OnResult, why: str) -> None:
        self._diag(f"FF: {why}（Wayland では先読みのキーを登録できません）")
        failed = [*self._plan.at_config, *self._plan.unsupported]
        done(not failed, failed)

    def _token(self) -> str:
        self._n += 1
        return f"nfff{os.getpid()}_{self._n}"

    def _close_session(self) -> None:
        s, self._session = self._session, None
        self._close(s)

    def _close(self, session: str | None) -> None:
        if session and self._bus is not None:
            self._bus.call(PORTAL_BUS, session, "org.freedesktop.portal.Session", "Close", None, None,
                           Gio.DBusCallFlags.NONE, 3000, None, None, None)

    def apply(self, cfg: ff.FfConfig, done: OnResult, overlay: bool = False) -> None:
        """global のキーだけポータルに登録する。overlay-only は使えないものとして failed に入れる（上の説明）。"""
        self._gen += 1
        gen = self._gen
        self._close_session()
        self._plan = ff.key_plan(cfg, "wayland")
        if not cfg.enabled:
            done(True, [])
            return
        triggers = {a: cfg.keys[a].portal_trigger() if a in cfg.keys else None for a in self._plan.at_config}
        if not triggers:
            # 登録するキーが無い（全部 overlay-only）。ポータルには触らない
            failed = list(self._plan.unsupported)
            done(not failed, failed)
            return
        try:
            if self._bus is None:
                self._bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        except GLib.Error:
            self._fail(done, "セッションの D-Bus につながれません")
            return

        def on_version(bus, res) -> None:
            if gen != self._gen:
                return
            try:
                v = int(bus.call_finish(res).unpack()[0])
            except (GLib.Error, TypeError, ValueError):
                v = 0
            if v < 1:
                self._fail(done, "ポータルに GlobalShortcuts がありません")
                return
            self._create(gen, triggers, done)

        self._bus.call(
            PORTAL_BUS, PORTAL_PATH, "org.freedesktop.DBus.Properties", "Get",
            GLib.Variant("(ss)", (GS_IFACE, "version")), GLib.VariantType("(v)"),
            Gio.DBusCallFlags.NONE, _VERSION_TIMEOUT_MS, None, on_version,
        )

    def _ensure_proxy(self) -> None:
        if self._proxy is not None:
            return
        self._proxy = Gio.DBusProxy.new_sync(
            self._bus, Gio.DBusProxyFlags.DO_NOT_LOAD_PROPERTIES, None, PORTAL_BUS, PORTAL_PATH, GS_IFACE, None
        )
        self._proxy.connect("g-signal", self._on_signal)

    def _request(self, method: str, build: Callable[[str], GLib.Variant], timeout_s: int, cb: Callable[[int, dict], None]) -> None:
        """「要求 → Request の Response の信号」を1回。応答か時間切れで cb(code, results) を1回だけ呼ぶ。"""
        token = self._token()
        sender = self._bus.get_unique_name()[1:].replace(".", "_")
        req_path = f"/org/freedesktop/portal/desktop/request/{sender}/{token}"
        box: dict[str, Any] = {"done": False}

        def finish(code: int, results: dict) -> None:
            if box["done"]:
                return
            box["done"] = True
            self._bus.signal_unsubscribe(box["sub"])
            if box.get("tid"):
                GLib.source_remove(box["tid"])
            cb(code, results)

        def on_resp(_c, _s, _p, _i, _sig, params, *_a) -> None:
            code, results = params.unpack()
            finish(int(code), dict(results))

        def on_timeout() -> bool:
            box["tid"] = 0
            finish(2, {})
            return False

        def on_called(proxy, res) -> None:
            try:
                proxy.call_finish(res)
            except GLib.Error:
                finish(2, {})

        box["sub"] = self._bus.signal_subscribe(
            PORTAL_BUS, "org.freedesktop.portal.Request", "Response", req_path, None,
            Gio.DBusSignalFlags.NO_MATCH_RULE, on_resp,
        )
        box["tid"] = GLib.timeout_add_seconds(timeout_s, on_timeout)
        self._proxy.call(method, build(token), Gio.DBusCallFlags.NONE, 10000, None, on_called)

    def _create(self, gen: int, triggers: dict[str, str | None], done: OnResult) -> None:
        try:
            self._ensure_proxy()
        except GLib.Error:
            self._fail(done, "ポータルの GlobalShortcuts につながれません")
            return
        sess_token = self._token()

        def on_created(code: int, res: dict) -> None:
            session = res.get("session_handle")
            if gen != self._gen:
                # 途中で ff-config が送り直された。古いセッションは閉じるだけ
                self._close(str(session) if session else None)
                return
            if code != 0 or not session:
                self._fail(done, "GlobalShortcuts のセッションを作れません")
                return
            self._session = str(session)
            self._bind(gen, triggers, done)

        self._request(
            "CreateSession",
            lambda t: GLib.Variant("(a{sv})", ({
                "handle_token": GLib.Variant("s", t),
                "session_handle_token": GLib.Variant("s", sess_token),
            },)),
            30, on_created,
        )

    def _bind(self, gen: int, triggers: dict[str, str | None], done: OnResult) -> None:
        wanted = [a for a in self._plan.at_config if triggers.get(a)]
        shortcuts = [
            (a, {"description": GLib.Variant("s", _DESCRIPTIONS[a]), "preferred_trigger": GLib.Variant("s", triggers[a])})
            for a in wanted
        ]

        def on_bound(code: int, res: dict) -> None:
            if gen != self._gen:
                return
            bound = {str(s[0]) for s in (res.get("shortcuts") or [])} if code == 0 else set()
            not_bound = [a for a in self._plan.at_config if a not in bound]
            if not_bound:
                self._diag(f"FF: ポータルで全体キーを登録できませんでした（{', '.join(not_bound)}）")
            failed = [*not_bound, *self._plan.unsupported]
            done(not failed, failed)

        if not wanted:
            on_bound(2, {})
            return
        session = self._session
        self._request(
            "BindShortcuts",
            lambda t: GLib.Variant("(oa(sa{sv})sa{sv})", (session, shortcuts, "", {"handle_token": GLib.Variant("s", t)})),
            _BIND_TIMEOUT_S, on_bound,
        )

    def _on_signal(self, _proxy, _sender, signal: str, params: GLib.Variant) -> None:
        if signal != "Activated":
            return
        t = time.monotonic()
        session, shortcut_id = params.unpack()[0:2]
        if session != self._session or shortcut_id not in self._plan.at_config:
            return
        self._on_key(str(shortcut_id), t)

    def set_overlay(self, _want: bool) -> list[str] | None:
        # Wayland では overlay-only のキーを登録しない。ff-config のときに1回知らせたので、行を出すたびには試さない
        return None

    def stop(self) -> None:
        self._gen += 1
        self._close_session()


def make_keys(session: str, on_key: OnKey, diag: Diag) -> X11Keys | PortalKeys:
    return PortalKeys(on_key, diag) if session == "wayland" else X11Keys(on_key, diag)
