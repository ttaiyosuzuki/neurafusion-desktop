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

# VM の中で実物（GNOME の X11 / Wayland のセッションを立てて、その中で動かす）
apps/nf-overlay-linux/scripts/vm-session.sh x11 apps/nf-overlay-linux/scripts/drive.py --config cfg.json --out /tmp/lines.jsonl --fifo /tmp/nf-drive.fifo
```

`scripts/fake-ai.py` は確認用の「AI アプリの代わり」の窓（`--no-a11y` で AT-SPI に出さない版）。`scripts/drive.py` は Node の代わりに
config を渡し、出てきた行を本文抜き（文字数と真偽だけ）で記録する。`scripts/press-button.py` は同意の小窓・画面共有の確認のボタンを
本人の代わりに AT-SPI で押す（確認用。丸の本体は使わない）。
