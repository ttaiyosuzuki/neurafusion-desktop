# 右下の丸 — Linux 版（DK-08）

AI アプリのウィンドウの右下に小さな丸を重ねる Linux のネイティブ部品
（`apps/nf-overlay-linux`、実行ファイル `nf-overlay`。Python 3 + GTK 3（PyGObject））の設計・約束・未確認の点。
Node の CLI（`src/overlay/`）とのやりとりは Mac・Windows と同じ [overlay-protocol.md](overlay-protocol.md) に従い、
Windows 版で足した 7 点（[overlay-windows.md](overlay-windows.md)「違う・足した点」）も同じ形で受ける・出す。

## X11 と Wayland で動きが違う

| 場面 | X11（Xorg） | Wayland |
|---|---|---|
| 前面のアプリ | libwnck（`_NET_ACTIVE_WINDOW`）で前面のウィンドウと `WM_CLASS` を知る | 他のアプリの前面・位置は取れない（Wayland の決まり） |
| 丸の位置 | 対象のウィンドウの右下。移動・大きさの変更・最小化についていく | **画面（主モニターの作業領域）の右下に固定** |
| 丸の窓 | 枠なし・常に前面・タスクバーに出さない・フォーカスを取らない | 同じ窓を XWayland で出す（GNOME は layer-shell が無く、ネイティブ Wayland の窓は自分で位置を決められないため） |
| 押したとき ① | AT-SPI（アクセシビリティ）で、押したウィンドウの文書・文字の要素を読む。入力欄は読まない | なし（どのアプリかも分からない） |
| 押したとき ② | ①で読めなければ、**毎回同意の小窓**を出し、はいのときだけそのウィンドウ1つを撮る（X の `GetImage`） | **毎回同意の小窓** → はいのとき xdg-desktop-portal の Screenshot（`interactive:true`。GNOME の撮影の確認が毎回出る）で撮る |
| 文字認識 | Tesseract（Apache-2.0、`tesseract-ocr`・`-jpn`）を端末内で起動。画像は標準入力で渡し、ファイルに置かない | 同じ。ポータルが書いた画像ファイルは読んだらすぐ消す |

- 押す前は読まない。常時監視しない。X11 で受け取るのは「前面がどれか」「枠がどこか」の通知だけ。AT-SPI のイベントは購読しない（押したときに1回だけ木をたどる）。
- 撮った画像はメモリの中だけで使い、保存も送信もしない。例外のメッセージも出さない（他のアプリの文字を含みうる）。
- 設定（`config`）を受け取るまで前面の追跡を始めない。標準入力が閉じたら終了する。

## 約束（overlay-protocol.md との対応）

- `ready`: `{"platform":"linux","session":"x11"|"wayland","ax":…,"screen":…,"ocr":…,"version":…}`。
  `ax` は AT-SPI のバスにつながるか、`screen` は X11 なら常に true・Wayland ならポータルの Screenshot があるか、`ocr` は tesseract があるか。
- `config.apps[].linux`: `WM_CLASS` の名前（instance か class。小文字で比較）。確かめた値だけ（`src/overlay/apps.ts`）。
- `read.method`: `"atspi"`（Mac の `"ax"`・Windows の `"uia"` に当たる）/ `"ocr"` / `"none"`。
  理由は `"atspi-empty"` / `"atspi-error"` / `"ocr-empty"` / `"ocr-error"` / `"screen-denied"`（ポータルで断られた）/ `"consent-declined"` / `"read-off"`。`attempts` も Windows と同じ形。
- Wayland の `geometry` は `app:"*"`・`window` = 作業領域・`fixed:true`。`clicked`・`read` の `app` は `"*"`（どのアプリか分からない）。
- `apps[].read` の `"atspi-only"`・`"atspi-then-ocr"` は `"ax-only"`・`"ax-then-ocr"` と同じ。
- `{"type":"get-read-log"}` → `read-log`（`atspiOk`・`atspiNg`・`ocrOk`・`ocrNg`・`status`）。ネイティブ側の数だけの記録は `~/.local/share/neurafusion/overlay/read-log.json`。
