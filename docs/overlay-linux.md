# 右下の丸 — Linux 版（DK-08）

AI アプリのウィンドウの右下に小さな丸を重ねる Linux のネイティブ部品
（`apps/nf-overlay-linux`、起動口 `nf-overlay`。Python 3 + GTK 3（PyGObject））の設計・約束・実測・未確認の点。
Node の CLI（`src/overlay/`）とのやりとりは Mac・Windows と同じ [overlay-protocol.md](overlay-protocol.md) に従い、
Windows 版で足した 7 点（[overlay-windows.md](overlay-windows.md)「違う・足した点」）も同じ形で受ける・出す。

## X11 と Wayland で動きが違う

| 場面 | X11（Xorg） | Wayland |
|---|---|---|
| 前面のアプリ | libwnck（`_NET_ACTIVE_WINDOW`）で前面のウィンドウと `WM_CLASS`（instance → class の順に照合）を知る | 他のアプリの前面・位置は取れない（Wayland の決まり） |
| 丸の位置 | 対象のウィンドウの右下（CSD の見えない影 `_GTK_FRAME_EXTENTS` は除く）。移動・大きさの変更・最小化についていく | **主モニターの作業領域の右下に固定**。アプリごとのオン・オフは効かせようがないので、全体のオン・オフ（`config.enabled`）だけで出し入れする |
| 丸の窓 | override-redirect の小窓（枠なし・常に前面・フォーカスを取らない・丸の外は押せない） | 同じ窓を XWayland で出す（GNOME には layer-shell が無く、ネイティブ Wayland の窓は自分で位置を決められないため。`GDK_BACKEND=x11`） |
| 押したとき ① | AT-SPI で、押したウィンドウ（PID と題名で探す）の文書・文字の葉の要素を読む。入力欄（EDITABLE・パスワード）は読まない | なし（どのアプリかも分からない） |
| 押したとき ② | ①で読めなければ、**毎回同意の小窓**（既定は「撮らない」）→ はいのときだけそのウィンドウ1つを撮る（X の GetImage） | **毎回同意の小窓** → はいのとき xdg-desktop-portal の **ScreenCast（画面共有）** を `persist_mode:0`（許可を覚えさせない）で開き、GNOME の「Share Screen」で本人が選んだ窓か画面を PipeWire から **1枚だけ** 取り出してすぐ閉じる。ScreenCast が無い環境だけ Screenshot（interactive）に切り替える |
| 文字認識 | Tesseract（`tesseract-ocr`・`-jpn`）を端末内で起動。画像は標準入力で渡し、ファイルに置かない | 同じ（ScreenCast はファイルを作らない。Screenshot のときはポータルが書いた画像を読んだらすぐ消す） |

- 押す前は読まない。常時監視しない。X11 で受け取るのは「前面がどれか」「枠がどこか」「最小化か」の通知だけ。AT-SPI のイベントは購読しない（押したときに主スレッドで1回だけ木をたどる）。
- 押した1回につき、読み取りの開始を1回だけ許す印（`ReadGate`。押したウィンドウに結びつき、10 秒で切れる）。印は `ReadGate` しか作れない。
- 同意を断った・ポータルで取り消した・読み取りオフのときは「読めない」と数えない（アプリのせいではない）。
- 撮った画像はメモリの中だけで使い、保存も送信もしない。例外のメッセージも出さない（他のアプリの文字を含みうる）。
- 自分の窓（丸・パネル・同意の小窓）が前面になった間と、それを閉じた直後の「前面なし」では丸を動かさない。
- 設定（`config`）を受け取るまで前面の追跡を始めない。標準入力が閉じたら終了する。

## 約束（overlay-protocol.md との対応）

- `ready`: `{"platform":"linux","session":"x11"|"wayland","ax":…,"screen":…,"ocr":…,"version":…}`。
  `ax` は AT-SPI のバスにつながるか（Wayland では常に false）、`screen` は X11 なら true・Wayland なら ScreenCast か Screenshot のポータルがあるか、`ocr` は tesseract があるか。
- `config.apps[].linux`: `WM_CLASS` の名前（instance か class。小文字で比較）。`{"wmClass":[…]}` の形も受ける。確かめた値だけ（`src/overlay/apps.ts`）。
- `read.method`: `"atspi"`（Mac の `"ax"`・Windows の `"uia"` に当たる）/ `"ocr"` / `"none"`。
  理由は `"atspi-empty"` / `"atspi-error"` / `"ocr-empty"` / `"ocr-error"` / `"screen-denied"`（ポータルで断られた・失敗）/ `"consent-declined"` / `"read-off"`。`attempts` も Windows と同じ形。本文は末尾 20,000 字まで。
- Wayland の `geometry` は `app:"*"`・`window` = 作業領域・`fixed:true`。`clicked`・`read` の `app` も `"*"`。
- `apps[].read` の `"atspi-only"`・`"atspi-then-ocr"`（と Windows の `uia-…`）は `"ax-only"`・`"ax-then-ocr"` と同じ意味。
- `{"type":"get-read-log"}` → `read-log`（アプリごとの `atspiOk`・`atspiNg`・`ocrOk`・`ocrNg`・`status`）。ネイティブ側の数だけの記録は `~/.local/share/neurafusion/overlay/read-log.json`（AT-SPI で読めないと分かっているアプリは次から OCR を先に試す）。

## 対応アプリの WM_CLASS

2026-09-29 時点で、確かめた Linux の `WM_CLASS` は **0 件**（Claude・ChatGPT のデスクトップ版は Linux 版が無く、Cursor・Notion などは VM に入れて確かめていない）。
推測で埋めないので、X11 では今は丸が出るアプリが無い（Wayland は全体のオン・オフで出る）。
実機では対象アプリを前面にして `xprop WM_CLASS` を読み、出どころ（確かめた日・版）つきで `src/overlay/apps.ts` の `linux` に足す。

## 実測（2026-09-29、VM: Ubuntu 24.04.4 LTS・Lima 2.2.0 の vz・4 vCPU / 8 GiB / 40 GiB・画面なし）

確認は「AI アプリの代わりの窓」（`scripts/fake-ai.py`。AT-SPI に出る版と、`NO_AT_BRIDGE=1` で出ない版）で行った。本人の操作の代わりに
xdotool（X11 の移動・押す）と AT-SPI（同意の小窓・画面共有の確認のボタン）を使った。証拠の画面は neurafusion-repo の
`Claude outputs/dk08-linux-2026-09-29/`（`x11-*.png` 8 枚・`wayland-*.png` 6 枚と、本文を抜いた行の記録 `*-lines.jsonl`）。

| セッション | 動いたデスクトップ環境（実測） | 確かめたこと | 結果 |
|---|---|---|---|
| X11 | GNOME Shell 46.0（mutter 46.2、`--x11`・session mode ubuntu）on Xorg 21.1.12（dummy ドライバ 1920×1080） | 右下に出る・移動 2 回・大きさの変更 1 回についていく（geometry 7 行）、対象外・最小化・アプリのオフで隠れる（hidden 6 行）、押すまで読まない（押す前の read 0 行） | 通った |
| X11 | 同上 | 押す → AT-SPI で 173 字（入力欄の文字は含まない）。AT-SPI に出ない窓 → 同意を断る → 撮らない（`consent-declined`、OCR の数は増えない）→ 次に同意 → そのウィンドウだけを撮って OCR 173 字 → `read-log` は数だけ | 通った |
| Wayland | GNOME Shell 46.0（mutter 46.2、`--headless --wayland --virtual-monitor 1920x1080`）＋ Xwayland 23.2.6、xdg-desktop-portal 1.18.4 / -gnome 46.2、PipeWire 1.0.5 | 丸は作業領域の右下に固定（`fixed:true`）、押す → 同意を断る → 撮らない、同意 → 「Share Screen」で Share → PipeWire から1枚 → OCR 225 字、同意 → Cancel → `screen-denied`（数えない）、全体のオフで隠れる | 通った |

- gnome-session は logind のセッションが無いと上がらない（`--builtin` は 46 で無い）ので、X11 は gnome-shell を直接、Wayland は headless で動かした。
  ログイン画面（GDM）から入った本物のセッションではまだ試していない。
- Wayland の Screenshot（interactive）ポータルは、この VM では毎回失敗した（GNOME Shell 46 の撮影画面が、画像を書き終える前に「閉じた」を返し、ポータルが code 2 を返す。ソフトウェア描画で撮影が遅いため）。そのため ScreenCast を主にした。
- この VM では xdg-desktop-portal-gnome が画面共有の途中で落ちることがあった（GTK4 の中で segfault。`GSK_RENDERER=cairo` と、PipeWire を gnome-shell より先に起動することで確認の流れは通った）。落ちた直後の1回目は CreateSession が失敗する。

## 未確認（実機で確かめる）

- [ ] 本物の AI アプリ（Linux 版のある Cursor・Notion 等）の `WM_CLASS` と、AT-SPI で答えが読めるか（Electron/Chromium は、支援技術が動いていると伝わったときだけ木を作ることがある）
- [ ] GDM から入った「Ubuntu on Xorg」「Ubuntu」（Wayland）セッション、KDE Plasma・Xfce 等の他のデスクトップ
- [ ] HiDPI（拡大率 2 など）での丸の位置。今は拡大率 1 だけを確かめた（`scale` は常に 1.0 を出す）
- [ ] 画面共有の確認で「Application Window」を選んでその窓だけを共有する流れ（この VM では窓の一覧が空だった）
- [ ] 撮影＋OCR では入力欄も写る。X11 の確認では入力欄の文字は OCR に出なかったが、Wayland（画面全体を共有）では出た。入力欄を除く仕組みは無い
- [ ] 配布（.deb・AppImage）に入れたときの依存（DK-09 の担当が確かめる）

## 作る・試す

```sh
# OS に依存しない部分（TS-38 Linux 分）。Mac でも流せる
python3 -m unittest discover -s apps/nf-overlay-linux/tests > /tmp/nf-ovl-test.log 2>&1; echo EXIT=$?
# Node 側（Linux の行を受ける分を含む）
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts src/overlay/overlay.test.ts
# VM の中で（/tmp/nf-session.env に DISPLAY・DBUS_SESSION_BUS_ADDRESS 等がある前提）
OUT=/tmp/nf-x11 apps/nf-overlay-linux/scripts/vm-x11-check.sh
OUT=/tmp/nf-wl  apps/nf-overlay-linux/scripts/vm-wayland-check.sh
```

実行に要る OS のパッケージは [apps/nf-overlay-linux/README.md](../apps/nf-overlay-linux/README.md)。
