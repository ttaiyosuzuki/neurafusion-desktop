"""押したあとの読み取りの部品。どれも ReadPlanner から、門を通った1回だけ呼ばれる。

- AtspiReader: AT-SPI（アクセシビリティ）で、押したウィンドウの中の文書・文字の要素を読む。入力欄（編集できる要素）は読まない
- X11CaptureOcr: そのウィンドウ1つだけを撮り（X の GetImage）、Tesseract で端末内で文字にする
- PortalCaptureOcr: Wayland。xdg-desktop-portal の Screenshot（interactive）で撮り、同じく端末内で文字にする。
  ポータルが書いた画像ファイルは読んだらすぐ消す

撮った画像はメモリの中だけで扱い、Tesseract にも標準入力で渡す（ファイルに置かない）。
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import threading
from typing import Any, Callable
from urllib.parse import unquote, urlparse

import gi

gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, GLib, Gio  # noqa: E402

from .core.reading import ScreenDenied

MAX_NODES = 6000
MAX_DEPTH = 80


def run_on_main(fn: Callable[[], Any], timeout: float = 120.0) -> Any:
    """GTK の主スレッドで fn を動かして結果を待つ（Gdk・ダイアログは主スレッドだけで触る）。"""
    if threading.current_thread() is threading.main_thread():
        return fn()
    box: dict[str, Any] = {}
    done = threading.Event()

    def call() -> bool:
        try:
            box["v"] = fn()
        except BaseException as e:  # noqa: BLE001
            box["e"] = e
        done.set()
        return False

    GLib.idle_add(call)
    if not done.wait(timeout):
        raise TimeoutError()
    if "e" in box:
        raise box["e"]
    return box.get("v")


# ---------------- AT-SPI ----------------


def atspi_available() -> bool:
    try:
        gi.require_version("Atspi", "2.0")
        from gi.repository import Atspi  # noqa: F401

        return Atspi.get_desktop_count() > 0
    except Exception:  # noqa: BLE001
        return False


class AtspiReader:
    method = "atspi"

    def __init__(self, pid_of: Callable[[int], int], title_of: Callable[[int], str]) -> None:
        self._pid_of = pid_of
        self._title_of = title_of

    def read(self, window: int) -> str | None:
        gi.require_version("Atspi", "2.0")
        from gi.repository import Atspi

        pid = run_on_main(lambda: self._pid_of(window))
        title = run_on_main(lambda: self._title_of(window))
        if not pid:
            return None
        Atspi.set_timeout(1000, 10000)
        desktop = Atspi.get_desktop(0)
        app = None
        for i in range(desktop.get_child_count()):
            c = desktop.get_child_at_index(i)
            try:
                if c is not None and c.get_process_id() == pid:
                    app = c
                    break
            except GLib.Error:
                continue
        if app is None:
            return None
        frame = _pick_frame(Atspi, app, title)
        if frame is None:
            return None
        return "\n".join(_collect(Atspi, frame)) or None


def _pick_frame(Atspi, app, title: str):
    frames = []
    for i in range(app.get_child_count()):
        f = app.get_child_at_index(i)
        if f is not None:
            frames.append(f)
    for f in frames:
        try:
            if f.get_state_set().contains(Atspi.StateType.ACTIVE):
                return f
        except GLib.Error:
            pass
    for f in frames:
        try:
            if title and f.get_name() == title:
                return f
        except GLib.Error:
            pass
    return frames[0] if frames else None


def _collect(Atspi, root) -> list[str]:
    R = Atspi.Role
    text_roles = {
        R.DOCUMENT_WEB, R.DOCUMENT_TEXT, R.DOCUMENT_FRAME, R.PARAGRAPH, R.HEADING, R.LABEL, R.STATIC,
        R.TEXT, R.SECTION, R.LIST_ITEM, R.BLOCK_QUOTE, R.ARTICLE, R.TABLE_CELL, R.CAPTION,
    }
    out: list[str] = []
    seen = 0
    stack = [(root, 0)]
    while stack and seen < MAX_NODES:
        node, depth = stack.pop()
        seen += 1
        try:
            states = node.get_state_set()
            if not states.contains(Atspi.StateType.SHOWING):
                continue
            # 入力欄（打ち込んでいる質問・パスワード）は読まない
            if states.contains(Atspi.StateType.EDITABLE) or node.get_role() == R.PASSWORD_TEXT:
                continue
            role = node.get_role()
            n = node.get_child_count()
            if role in text_roles:
                s = ""
                ti = node.get_text_iface() if hasattr(node, "get_text_iface") else None
                if ti is not None:
                    cnt = Atspi.Text.get_character_count(node)
                    # 子を持つ文書の本文は子の側で拾う（二重に数えない）。葉の要素だけ文字を取る
                    if cnt and n == 0:
                        s = Atspi.Text.get_text(node, 0, min(cnt, 200_000))
                elif n == 0:
                    s = node.get_name() or ""
                s = (s or "").replace("￼", "").strip()
                if s:
                    out.append(s)
            if depth < MAX_DEPTH:
                for i in range(n - 1, -1, -1):
                    c = node.get_child_at_index(i)
                    if c is not None:
                        stack.append((c, depth + 1))
        except GLib.Error:
            continue
    return out


# ---------------- 文字認識（Tesseract・端末内） ----------------

_CJK = r"[　-ヿ㐀-鿿＀-￯]"


def ocr_available() -> bool:
    return shutil.which("tesseract") is not None


def ocr_langs() -> str:
    try:
        r = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True, timeout=10)
        have = set(r.stdout.split())
    except (OSError, subprocess.SubprocessError):
        have = set()
    langs = [l for l in ("jpn", "eng") if l in have]
    return "+".join(langs) or "eng"


def ocr_png(png: bytes, langs: str | None = None) -> str:
    r = subprocess.run(
        ["tesseract", "-", "-", "-l", langs or ocr_langs(), "--psm", "3"],
        input=png,
        capture_output=True,
        timeout=120,
    )
    if r.returncode != 0:
        raise RuntimeError("ocr failed")
    text = r.stdout.decode("utf-8", "replace")
    # 日本語の字と字の間に入る空白を詰める
    text = re.sub(f"(?<={_CJK}) +(?={_CJK})", "", text)
    return "\n".join(l.rstrip() for l in text.splitlines() if l.strip())


def _pixbuf_png(pb) -> bytes:
    ok, buf = pb.save_to_bufferv("png", [], [])
    if not ok:
        raise RuntimeError("encode failed")
    return bytes(buf)


class X11CaptureOcr:
    method = "ocr"

    def __init__(self, frame_of: Callable[[int], Any]) -> None:
        self._frame_of = frame_of  # xid → (Rect の枠, 影の分 left/top)

    def read(self, window: int) -> str | None:
        def grab() -> bytes | None:
            gi.require_version("GdkX11", "3.0")
            from gi.repository import GdkX11

            disp = Gdk.Display.get_default()
            gw = GdkX11.X11Window.foreign_new_for_display(disp, window)
            if gw is None:
                return None
            ox, oy, w, h = self._frame_of(window)
            pb = Gdk.pixbuf_get_from_window(gw, ox, oy, w, h)
            return _pixbuf_png(pb) if pb is not None else None

        png = run_on_main(grab)
        if not png:
            return None
        return ocr_png(png)


# ---------------- Wayland: xdg-desktop-portal ----------------

PORTAL_BUS = "org.freedesktop.portal.Desktop"
PORTAL_PATH = "/org/freedesktop/portal/desktop"


def portal_screenshot_available() -> bool:
    try:
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        r = bus.call_sync(
            PORTAL_BUS, PORTAL_PATH, "org.freedesktop.DBus.Properties", "Get",
            GLib.Variant("(ss)", ("org.freedesktop.portal.Screenshot", "version")),
            GLib.VariantType("(v)"), Gio.DBusCallFlags.NONE, 3000, None,
        )
        return r is not None
    except GLib.Error:
        return False


class PortalCaptureOcr:
    method = "ocr"

    def __init__(self, interactive: bool = True) -> None:
        self.interactive = interactive
        self._n = 0

    def _screenshot_uri(self) -> str:
        """主スレッドから呼ぶ。ポータルの応答を待って URI を返す。断られたら ScreenDenied。"""
        bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)
        self._n += 1
        token = f"nf{os.getpid()}_{self._n}"
        sender = bus.get_unique_name()[1:].replace(".", "_")
        req_path = f"/org/freedesktop/portal/desktop/request/{sender}/{token}"
        loop = GLib.MainLoop()
        box: dict[str, Any] = {}

        def on_resp(_c, _s, _p, _i, _sig, params, *_a):
            code, results = params.unpack()
            box["code"] = code
            box["uri"] = results.get("uri")
            loop.quit()

        sub = bus.signal_subscribe(
            PORTAL_BUS, "org.freedesktop.portal.Request", "Response", req_path, None,
            Gio.DBusSignalFlags.NO_MATCH_RULE, on_resp,
        )
        try:
            opts = {
                "handle_token": GLib.Variant("s", token),
                "interactive": GLib.Variant("b", self.interactive),
                "modal": GLib.Variant("b", True),
            }
            bus.call_sync(
                PORTAL_BUS, PORTAL_PATH, "org.freedesktop.portal.Screenshot", "Screenshot",
                GLib.Variant("(sa{sv})", ("", opts)), GLib.VariantType("(o)"),
                Gio.DBusCallFlags.NONE, 10000, None,
            )
            GLib.timeout_add_seconds(180, lambda: (loop.quit(), False)[1])
            loop.run()
        finally:
            bus.signal_unsubscribe(sub)
        if box.get("code") != 0 or not box.get("uri"):
            # 1 = 本人が取り消した、2 = その他（許可なし）
            raise ScreenDenied()
        return box["uri"]

    def read(self, window: int) -> str | None:
        uri = run_on_main(self._screenshot_uri, timeout=200)
        p = urlparse(uri)
        if p.scheme != "file":
            return None
        path = unquote(p.path)
        try:
            with open(path, "rb") as f:
                png = f.read()
        finally:
            # ポータルが書いた画像は残さない
            try:
                os.unlink(path)
            except OSError:
                pass
        return ocr_png(png)
