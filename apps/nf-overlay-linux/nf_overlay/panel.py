"""7区画のパネル（小窓 380×560）と、撮る前に毎回出す同意の小窓。

- panelMode "url": WebKitGTK（gir1.2-webkit2-4.1、LGPL）があれば panelUrl を開く。Node が PII を伏せた本文（panel-text）は
  Mac と同じく `nf-overlay-text` の出来事で Web 側に渡す
- それ以外・WebKitGTK が無い・読み込みに失敗: 「未接続」だけを出す（本番のデータがあるように見せない。本文は出さない）
"""

from __future__ import annotations

import json
from typing import Callable

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gtk  # noqa: E402

try:
    gi.require_version("WebKit2", "4.1")
    from gi.repository import WebKit2  # noqa: E402
except (ValueError, ImportError):
    WebKit2 = None

PANEL_W, PANEL_H = 380, 560

_DISCONNECTED = """<!doctype html><html lang="ja"><meta charset="utf-8">
<style>
:root{color-scheme:light dark;--fg:#1f2328;--muted:#5b6470;--bd:#d8dde3}
@media (prefers-color-scheme:dark){:root{--fg:#ecedee;--muted:#a3acb5;--bd:#3a4048}}
body{font:13px system-ui,sans-serif;color:var(--fg);margin:0;padding:20px}
h1{font-size:15px;margin:0 0 8px}.m{color:var(--muted);line-height:1.6}
.b{border:1px dashed var(--bd);border-radius:10px;padding:12px;margin-top:14px}
</style>
<h1>未接続</h1>
<p class="m">検品パネルの画面にまだつながっていません。結果は表示されません。</p>
%s
</html>"""


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class PanelWindow(Gtk.Window):
    def __init__(self, on_toggle: Callable[[bool, str], None]) -> None:
        super().__init__(title="NeuraFusion 検品")
        self._on_toggle = on_toggle
        self.mode = "disconnected"
        self._loaded_url: str | None = None
        self.set_default_size(PANEL_W, PANEL_H)
        self.set_keep_above(True)
        self.set_skip_taskbar_hint(True)
        self.connect("delete-event", self._close)
        if WebKit2 is not None:
            self._web = WebKit2.WebView()
            self._web.connect("load-failed", self._load_failed)
            self.add(self._web)
            self._label = None
        else:
            self._web = None
            self._label = Gtk.Label()
            self._label.set_line_wrap(True)
            self._label.set_xalign(0)
            self._label.set_yalign(0)
            self._label.set_margin_start(20)
            self._label.set_margin_top(20)
            self.add(self._label)

    def open_at(self, x: int, y: int, mode: str, url: str | None, status: str | None) -> None:
        self.mode = mode if (mode == "url" and url and self._web is not None) else "disconnected"
        if self.mode == "url":
            if url != self._loaded_url:
                self._loaded_url = url
                self._web.load_uri(url)
        else:
            self._loaded_url = None
            self.show_status(status)
        self.move(max(0, x), max(0, y))
        self.show_all()
        self.present()
        self._on_toggle(True, self.mode)

    def show_status(self, s: str | None) -> None:
        if self.mode != "disconnected":
            return
        detail = f'<div class="b">{_esc(s)}</div>' if s else ""
        if self._web is not None:
            self._web.load_html(_DISCONNECTED % detail, None)
        elif self._label is not None:
            self._label.set_markup("<b>未接続</b>\n検品パネルの画面にまだつながっていません。結果は表示されません。" + (f"\n\n{GLib.markup_escape_text(s)}" if s else ""))

    def deliver(self, text: str) -> None:
        """Node で PII を伏せた本文。未接続のときは何もしない（本文を画面に出さない）。"""
        if self.mode != "url" or self._web is None:
            return
        payload = json.dumps({"text": text}, ensure_ascii=False)
        js = f"window.dispatchEvent(new CustomEvent('nf-overlay-text',{{detail:{payload}}}));"
        if hasattr(self._web, "evaluate_javascript"):
            self._web.evaluate_javascript(js, -1, None, None, None, None, None)
        else:
            self._web.run_javascript(js, None, None)

    def _load_failed(self, *_a) -> bool:
        self.mode = "disconnected"
        self._loaded_url = None
        self.show_status("パネルの画面に接続できませんでした。")
        return True

    def _close(self, *_a) -> bool:
        self.hide()
        self._on_toggle(False, self.mode)
        return True


def ask_capture_consent(where: str) -> bool:
    """撮る前に毎回聞く（§8-3）。既定のボタンは「撮らない」。GTK の主スレッドで呼ぶ。"""
    d = Gtk.MessageDialog(
        message_type=Gtk.MessageType.QUESTION,
        buttons=Gtk.ButtonsType.NONE,
        text="画面を1枚撮って、答えを読み取りますか？",
    )
    d.format_secondary_text(
        f"{where}を撮り、このパソコンの中だけで文字を読み取ります。画像は保存も送信もしません。"
    )
    d.set_title("NeuraFusion — 画面の読み取り")
    d.add_button("撮らない", Gtk.ResponseType.CANCEL)
    d.add_button("撮って読む", Gtk.ResponseType.OK)
    d.set_default_response(Gtk.ResponseType.CANCEL)
    d.set_keep_above(True)
    d.set_wmclass("nf-overlay-consent", "NeuraFusion")
    r = d.run()
    d.destroy()
    return r == Gtk.ResponseType.OK
