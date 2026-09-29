#!/usr/bin/python3
"""VM での確認用の「AI アプリの代わり」の窓（本物の AI アプリの Linux 版が無い・ログインできない所で丸を試すため）。

    fake-ai.py            WM_CLASS nf-fake-ai        … AT-SPI で読める
    fake-ai.py --no-a11y  WM_CLASS nf-fake-ai-noa11y … AT-SPI に出さない（NO_AT_BRIDGE=1）→ 撮影＋文字認識の道を試す

入力欄には「読まれてはいけない文字」を入れておく（丸は入力欄を読まない）。
"""

import os
import sys

NO_A11Y = "--no-a11y" in sys.argv
if NO_A11Y:
    os.environ["NO_AT_BRIDGE"] = "1"
    os.environ["GTK_A11Y"] = "none"

import gi  # noqa: E402

gi.require_version("Gtk", "3.0")
from gi.repository import GLib, Gtk  # noqa: E402

QUESTION = "質問: 東京で新しいカフェを開く前に確かめることは？"
ANSWER = [
    "答え: 開業の前に、次の三つを確かめてください。",
    "1. 物件の用途地域と、飲食店の営業許可が取れるか。",
    "2. 半径500メートルの競合店の数と、昼と夜の人通り。",
    "3. 初期費用の見積もりと、半年分の運転資金。",
    "連絡先の例: yamada@example.com / 090-1234-5678",
]
INPUT_SECRET = "INPUT-SECRET-入力中の下書き"

GLib.set_prgname("nf-fake-ai-noa11y" if NO_A11Y else "nf-fake-ai")
win = Gtk.Window(title="Fake AI（NF テスト）" + ("・読めない版" if NO_A11Y else ""))
win.set_wmclass(GLib.get_prgname(), "Nf-fake-ai")
win.set_default_size(820, 560)
box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10)
for m in ("start", "end", "top", "bottom"):
    getattr(box, f"set_margin_{m}")(24)
css = Gtk.CssProvider()
css.load_from_data(b"label { font-size: 20px; } .q { font-weight: bold; }")
Gtk.StyleContext.add_provider_for_screen(win.get_screen(), css, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
q = Gtk.Label(label=QUESTION, xalign=0)
q.get_style_context().add_class("q")
box.pack_start(q, False, False, 0)
for line in ANSWER:
    box.pack_start(Gtk.Label(label=line, xalign=0, wrap=True), False, False, 0)
entry = Gtk.Entry()
entry.set_text(INPUT_SECRET)
box.pack_end(entry, False, False, 0)
win.add(box)
win.connect("destroy", Gtk.main_quit)
win.show_all()
Gtk.main()
