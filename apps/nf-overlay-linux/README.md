# nf-overlay（Linux）— 右下の丸（DK-08）

設計・約束・未確認の点は [docs/overlay-linux.md](../../docs/overlay-linux.md)。

- 言語: Python 3 + GTK 3（PyGObject）。OS の Python（`/usr/bin/python3`）で動かす
- 実行時に要る OS のパッケージ（Ubuntu 24.04 の名前）:
  `python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-wnck-3.0 gir1.2-atspi-2.0 at-spi2-core tesseract-ocr tesseract-ocr-jpn`
  （パネルで Web の画面を開くなら `gir1.2-webkit2-4.1`。無ければ「未接続」だけを出す）
- Wayland で撮るときに要るもの: `xdg-desktop-portal`（と GNOME なら `xdg-desktop-portal-gnome`）・`pipewire`・
  `gstreamer1.0-tools gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-pipewire`
- ライセンス: PyGObject・GTK・libwnck・AT-SPI・GStreamer は LGPL（別プロセス・動的に使うだけ）、Tesseract と日本語の学習データは Apache-2.0、PipeWire は MIT

## 試す

```sh
# OS に依存しない部分（TS-38 Linux 分）。Mac でも流せる
python3 -m unittest discover -s apps/nf-overlay-linux/tests > /tmp/nf-ovl-test.log 2>&1; echo EXIT=$?

# VM の中で実物（GNOME の X11 / Wayland のセッションを立て、確認台本を流す。手順と実測は docs/overlay-linux.md）
apps/nf-overlay-linux/scripts/vm-session.sh x11          # 素の GNOME（wayland / down も）
apps/nf-overlay-linux/scripts/vm-gdm-session.sh x11      # GDM の自動ログインで「Ubuntu on Xorg」（down で戻す）
apps/nf-overlay-linux/scripts/vm-gdm-session.sh wayland  # 同じく「Ubuntu」（Wayland。差し込み vm-nopulsex.c を作って入れる。要 gcc・libc6-dev）
OUT=/tmp/nf-x11 apps/nf-overlay-linux/scripts/vm-x11-check.sh
```

Node の CLI（`overlay start`）は Linux では更新の了承を `zenity` の小窓で聞く（無ければ「あとで」と同じ扱い）。

## FF 先読み（ff-*。約束は docs/overlay-protocol.md「FF 先読み」）

キーを押すまで何も出さない。手を選ぶのは Node、ここは**キーの受け取りと行の描画だけ**（`nf_overlay/core/ff.py`・`ff_keys.py`・`ff_strip.py`）。

- キーの範囲は ff-config の `scopes`（無ければ trigger が `global`、adopt・close が `overlay-only`）。
- X11: libX11 を ctypes で使い（GDK とは別の接続）、ルートウィンドウに `XGrabKey` で `global` のキーを取る。
  `overlay-only` のキー（adopt・Esc）は行が出ている間だけ取り、隠したら `XUngrabKey` で外す。
  CapsLock・NumLock が付いていても効くよう、それらのマスクを足した組でも取る。他のアプリが先に取っていると
  `BadAccess` になり、`ff-keys` の `failed` に入る（そのとき取ろうとしたキーの分。行を出すたびに overlay-only の結果も出す）。
- Wayland: xdg-desktop-portal の `GlobalShortcuts`（CreateSession → BindShortcuts の `preferred_trigger` → `Activated`）。
  `global` のキー（既定は trigger）だけ登録する。`overlay-only`（既定は adopt・close）は登録せず、ff-config のあと
  1回だけ `ff-keys` の `failed` に入れる（行を出すたびには試さない。`core/ff.py` の `key_plan`）。
  ポータルが無い（例: Ubuntu 24.04 の GNOME 46）と登録するはずだった分も `failed`、標準エラーに診断1行。
- 行の窓: `POPUP`・`set_accept_focus(False)`・`set_keep_above(True)`・マウス素通し（空の入力の形）・`set_opacity`。主画面の作業領域の下寄り中央。
  `ff-drawn.ms` は `time.monotonic()` でキーを受けた時刻から、窓の draw の後の空き時間（描いた分を X へ送った後）まで。
- 画面共有から隠す API は使わない（FF-07。`tests/test_ff.py` が静的に見張る）。

限り:
- X11 のキーは US 配列の位置ではなく、今の配列で keysym（`period` など）が乗っているキーを取る。Super は Mod4 と決め打ち。
- Wayland ではポータルに「表示中だけ」の登録が無く、行の窓はフォーカスを取らないので、adopt（これで行く）・close（Esc）は使えない
  （Esc・Alt+Shift+. を他のアプリから奪わないため）。行は Node の ff-hide で閉じる。trigger のキーはデスクトップの確認の画面で
  本人が変えられる（実際に付いたキーは見ていない）。
- Wayland の丸・行の窓は XWayland。合成の無い X11 では半透明にならない。
- VM（`nf-linux`）での実測（キー → 描画の ms・BadAccess・ポータル）はまだ（重い処理の順番待ち）。

`scripts/fake-ai.py` は確認用の「AI アプリの代わり」の窓（`--no-a11y` で AT-SPI に出さない版）。`scripts/drive.py` は Node の代わりに
config を渡し、出てきた行を本文抜き（文字数と真偽だけ）で記録する。`scripts/press-button.py` は同意の小窓・画面共有の確認のボタンを
本人の代わりに AT-SPI で押す（確認用。丸の本体は使わない）。`scripts/vm-node-host.ts` は Node 側（`src/overlay/host.ts`）から
`overlay start` と同じ順で丸を起動する確認用の 1 本（esbuild でまとめて VM の Node で動かす）。
