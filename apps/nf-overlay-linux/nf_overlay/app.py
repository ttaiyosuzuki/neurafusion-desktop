"""nf-overlay（Linux）の本体。標準入出力で Node と 1 行 JSON を話す（docs/overlay-protocol.md・docs/overlay-linux.md）。

X11: 前面の対応アプリのウィンドウの右下に丸を重ね、ついていく。押したら AT-SPI → だめなら同意を取って撮影＋文字認識。
Wayland: 丸は画面の右下に固定。押したら同意を取り、ポータルの許可を取って撮影＋文字認識。
"""

from __future__ import annotations

import os
import sys
import threading

VERSION = "0.1.0"


def detect_session(env=os.environ) -> str:
    if env.get("NF_OVERLAY_SESSION") in ("x11", "wayland"):
        return env["NF_OVERLAY_SESSION"]
    if env.get("XDG_SESSION_TYPE") == "wayland" or env.get("WAYLAND_DISPLAY"):
        return "wayland"
    return "x11"


SESSION = detect_session()
if SESSION == "wayland":
    # GNOME には layer-shell が無く、ネイティブ Wayland の窓は自分で位置を決められない。丸とパネルは XWayland で出す
    os.environ["GDK_BACKEND"] = "x11"

import gi  # noqa: E402

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
from gi.repository import Gdk, GLib, Gtk  # noqa: E402

from . import readers  # noqa: E402
from .core import protocol  # noqa: E402
from .core.follow import FollowTracker, fixed_decision  # noqa: E402
from .core.geometry import Rect  # noqa: E402
from .core.reading import ReadGate, ReadLog, ReadPlanner  # noqa: E402
from .dot import DotWindow  # noqa: E402
from .panel import PANEL_H, PANEL_W, PanelWindow, ask_capture_consent  # noqa: E402


def state_dir() -> str:
    base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "neurafusion", "overlay")


class Overlay:
    def __init__(self) -> None:
        self.session = SESSION
        self._out_lock = threading.Lock()
        self.config: protocol.OverlayConfig | None = None
        self.tracker = FollowTracker()
        self.gate = ReadGate()
        self.log = ReadLog.from_json(self._load_log())
        self.planner = ReadPlanner(self.gate, self.log)
        self.dot = DotWindow(self.on_click)
        self.panel = PanelWindow(lambda open_, mode: self.emit(protocol.panel(open_, mode)))
        self.watcher = None
        self._xid = 0
        self._app: str | None = None
        self._reading = False
        self._buf = b""

    # ---- 出す ----
    def emit(self, line: str | None) -> None:
        if not line:
            return
        with self._out_lock:
            sys.stdout.write(line + "\n")
            sys.stdout.flush()

    def diag(self, s: str) -> None:
        # 標準エラーは人が読む診断だけ（本文は出さない）
        sys.stderr.write(f"nf-overlay: {s}\n")
        sys.stderr.flush()

    # ---- 受ける ----
    def start_stdin(self) -> None:
        ch = GLib.IOChannel.unix_new(sys.stdin.fileno())
        ch.set_encoding(None)
        ch.set_buffered(False)
        GLib.io_add_watch(ch, GLib.PRIORITY_DEFAULT, GLib.IOCondition.IN | GLib.IOCondition.HUP | GLib.IOCondition.ERR, self._on_stdin)

    def _on_stdin(self, _ch, cond) -> bool:
        data = b""
        if cond & GLib.IOCondition.IN:
            try:
                data = os.read(sys.stdin.fileno(), 65536)
            except OSError:
                data = b""
        if not data:
            self.quit(0)
            return False
        self._buf += data
        while b"\n" in self._buf:
            line, self._buf = self._buf.split(b"\n", 1)
            self.handle(line)
        if len(self._buf) > protocol.MAX_LINE_BYTES:
            self._buf = b""
        return True

    def handle(self, line: bytes) -> None:
        msg = protocol.parse_inbound(line)
        if msg is None:
            return
        if msg.type == "stop":
            self.quit(0)
        elif msg.type == "config":
            first = self.config is None
            self.config = msg.config
            self.gate.reset()
            if first:
                self.emit(
                    protocol.ready(
                        self.session,
                        ax=self.session == "x11" and readers.atspi_available(),
                        screen=self.session == "x11" or readers.portal_screenshot_available(),
                        ocr=readers.ocr_available(),
                        version=VERSION,
                    )
                )
            self.apply_config(first)
        elif msg.type == "panel-text":
            self.panel.deliver(msg.text or "")
        elif msg.type == "get-read-log":
            self.emit(protocol.read_log(self.log.to_wire()))

    def apply_config(self, first: bool) -> None:
        if self.session == "wayland":
            d = fixed_decision(self.config, self._primary_work_area())
            self._app = d.app
            self._xid = 0
            self._show(d.dot)
            self.emit(d.line)
            return
        if first:
            from .x11_watch import X11Watcher

            self.watcher = X11Watcher(self._on_active, self._on_geometry)
            self.watcher.start()
        d = self.tracker.set_config(self.config)
        if d is not None:
            self._apply(d)

    # ---- X11 の追従 ----
    def _on_active(self, info) -> None:
        self._apply(self.tracker.on_active(info))

    def _on_geometry(self, xid: int, frame: Rect, minimized: bool, work_area: Rect) -> None:
        d = self.tracker.on_geometry(xid, frame, minimized, work_area)
        if d is not None:
            self._apply(d)

    def _apply(self, d) -> None:
        self._xid = d.xid if d.dot is not None else 0
        self._app = d.app if d.dot is not None else None
        self._show(d.dot)
        self.emit(d.line)

    def _show(self, dot: Rect | None) -> None:
        if dot is None:
            self.dot.hide()
            self.gate.reset()
        else:
            self.dot.show_at(dot.x, dot.y, dot.w)

    def _primary_work_area(self) -> Rect:
        disp = Gdk.Display.get_default()
        mon = disp.get_primary_monitor() or disp.get_monitor(0)
        wa = mon.get_workarea()
        return Rect(wa.x, wa.y, wa.width, wa.height)

    # ---- 押したとき ----
    def on_click(self) -> None:
        if self._reading or self.config is None or not self._app:
            return
        app, xid = self._app, self._xid
        self.emit(protocol.clicked(app))
        ticket = self.gate.on_click(app, xid)
        self._open_panel("読み取っています…")
        self._reading = True
        cfg = self.config
        if self.session == "wayland":
            atspi = None
            ocr = readers.PortalCaptureOcr(interactive=True)
            where = "画面（次に出る確認で、撮る範囲を選べます）"
        else:
            w = self.watcher
            atspi = readers.AtspiReader(w.window_pid, w.window_title)
            ocr = readers.X11CaptureOcr(w.capture_rect)
            where = "このウィンドウ1つだけ"

        def consent(_app: str) -> bool:
            return bool(readers.run_on_main(lambda: ask_capture_consent(where), timeout=600))

        def work() -> None:
            try:
                out = self.planner.run(ticket, xid, cfg, atspi, ocr, consent)
            except Exception:  # noqa: BLE001 — 中身は出さない
                out = None
            GLib.idle_add(self._done, out)

        threading.Thread(target=work, daemon=True).start()

    def _done(self, out) -> bool:
        self._reading = False
        if out is None:
            self.emit(protocol.error("read-failed", "読み取りの途中で失敗しました"))
            self.panel.show_status("読み取れませんでした。")
            return False
        self.emit(out.protocol_line())
        self._save_log()
        if out.ok:
            self.panel.show_status(f"{len(out.text)} 字を読み取りました（本文はここには出しません）。")
        else:
            self.panel.show_status(f"読み取れませんでした（{out.reason or '不明'}）。")
        return False

    def _open_panel(self, status: str) -> None:
        dot = self.tracker.dot if self.session == "x11" else None
        if dot is None and self.dot.get_visible():
            x, y = self.dot.get_position()
            dot = Rect(x, y, self.dot.get_size()[0], self.dot.get_size()[1])
        # 丸を隠さないよう、丸の上に出す（題名の帯の分 56px も空ける）
        x = (dot.right - PANEL_W) if dot else 0
        y = (dot.y - PANEL_H - 56) if dot else 0
        cfg = self.config
        self.panel.open_at(x, max(0, y), cfg.panel_mode, cfg.panel_url, status)

    # ---- 記録（数だけ） ----
    def _log_path(self) -> str:
        return os.path.join(state_dir(), "read-log.json")

    def _load_log(self) -> str | None:
        try:
            with open(self._log_path(), encoding="utf-8") as f:
                return f.read()
        except OSError:
            return None

    def _save_log(self) -> None:
        try:
            os.makedirs(state_dir(), exist_ok=True)
            tmp = self._log_path() + f".{os.getpid()}.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(self.log.to_json())
            os.replace(tmp, self._log_path())
        except OSError:
            self.diag("read-log を保存できませんでした")

    def quit(self, code: int) -> None:
        self.dot.hide()
        self.panel.hide()
        Gtk.main_quit()
        self._exit = code


def main() -> int:
    if Gdk.Display.get_default() is None:
        sys.stdout.write(protocol.error("no-display", "画面につながれません（DISPLAY が無い）") + "\n")
        sys.stdout.flush()
        return 2
    ov = Overlay()
    ov._exit = 0
    ov.start_stdin()
    Gtk.main()
    return ov._exit


if __name__ == "__main__":
    sys.exit(main())
