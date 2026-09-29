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
| 押したとき ② | ①で読めなければ、**毎回同意の小窓**（既定は「撮らない」）→ はいのときだけそのウィンドウ1つの中身を撮る（合成された窓の GetImage。重なった他の窓・自分のパネルは写らない） | **毎回同意の小窓** → はいのとき xdg-desktop-portal の **ScreenCast（画面共有）** を `persist_mode:0`（許可を覚えさせない）で開き、GNOME の「Share Screen」で本人が選んだ窓か画面を PipeWire から **1枚だけ** 取り出してすぐ閉じる。撮る間は自分のパネルを隠す（画面全体を選ばれたときに写らないように）。ScreenCast が無い環境だけ Screenshot（interactive）に切り替える |
| 文字認識 | Tesseract（`tesseract-ocr`・`-jpn`）を端末内で起動。画像は標準入力で渡し、ファイルに置かない | 同じ（ScreenCast はファイルを作らない。Screenshot のときはポータルが書いた画像を読んだらすぐ消す） |

- 押す前は読まない。常時監視しない。X11 で受け取るのは「前面がどれか」「枠がどこか」「最小化か」の通知だけ。AT-SPI のイベントは購読しない（押したときに主スレッドで1回だけ木をたどる）。
- 押した1回につき、読み取りの開始を1回だけ許す印（`ReadGate`。押したウィンドウに結びつき、10 秒で切れる）。印は `ReadGate` しか作れない。
- 同意の小窓は、丸を押した時刻（X のイベント時刻）で出し、開いているパネルの子窓にする。丸はフォーカスを取らない窓なので、
  時刻を渡さないと GNOME がフォーカスの横取りとみなし、小窓は左上に出て「準備ができました」の通知になった（GDM から入った Ubuntu on Xorg で実測）。
- 同意を断った・ポータルで取り消した・読み取りオフのときは「読めない」と数えない（アプリのせいではない）。
- 撮った画像はメモリの中だけで使い、保存も送信もしない。例外のメッセージも出さない（他のアプリの文字を含みうる）。
- 自分の窓（丸・パネル・同意の小窓）が前面になった間と、それを閉じた直後の「前面なし」では丸を動かさない。
- 設定（`config`）を受け取るまで前面の追跡を始めない。標準入力が閉じたら終了する。

## 約束（overlay-protocol.md との対応）

- `ready`: `{"platform":"linux","session":"x11"|"wayland","ax":…,"screen":…,"ocr":…,"version":…}`。
  `ax` は AT-SPI のバスにつながるか（Wayland では常に false）、`screen` は X11 なら true・Wayland なら xdg-desktop-portal が
  動いているか起こせるか（名前を見るだけで、すぐ返る。ScreenCast か Screenshot かは押したときに決める。起動直後のポータルは
  最初の応答に 20 秒ほどかかることがあり、ここで待つと丸が出るのも遅れた）、`ocr` は tesseract があるか。
- `config.apps[].linux`: `WM_CLASS` の名前（instance か class。小文字で比較）。`{"wmClass":[…]}` の形も受ける。確かめた値だけ（`src/overlay/apps.ts`）。
- `read.method`: `"atspi"`（Mac の `"ax"`・Windows の `"uia"` に当たる）/ `"ocr"` / `"none"`。
  理由は `"atspi-empty"` / `"atspi-error"` / `"ocr-empty"` / `"ocr-error"` / `"screen-denied"`（ポータルで断られた・失敗）/ `"consent-declined"` / `"read-off"`。`attempts` も Windows と同じ形。本文は末尾 20,000 字まで。
- Wayland の `geometry` は `app:"*"`・`window` = 作業領域・`fixed:true`。`clicked`・`read` の `app` も `"*"`。
- `apps[].read` の `"atspi-only"`・`"atspi-then-ocr"`（と Windows の `uia-…`）は `"ax-only"`・`"ax-then-ocr"` と同じ意味。
- `{"type":"get-read-log"}` → `read-log`（アプリごとの `atspiOk`・`atspiNg`・`ocrOk`・`ocrNg`・`status`）。ネイティブ側の数だけの記録は `~/.local/share/neurafusion/overlay/read-log.json`（AT-SPI で読めないと分かっているアプリは次から OCR を先に試す）。

## 対応アプリの WM_CLASS

2026-09-29 時点で確かめた Linux の `WM_CLASS` は **1 件**:

| アプリ | WM_CLASS（実測） | 出どころ |
|---|---|---|
| Cursor | `"cursor", "cursor"`（.desktop の `StartupWMClass=Cursor` とは大文字小文字が違う。比較は小文字） | Cursor-3.22.12-x86_64.AppImage を VM の「Ubuntu on Xorg」で起動して `xprop WM_CLASS` |

Claude・ChatGPT のデスクトップ版は Linux 版が無い。Notion も公式の Linux 版が無い。ほかの Tier 1 は Linux で確かめていない。
推測で埋めないので、X11 では今は Cursor だけに丸が出る（Wayland は全体のオン・オフで出る）。
実機では対象アプリを前面にして `xprop WM_CLASS` を読み、出どころ（確かめた日・版）つきで `src/overlay/apps.ts` の `linux` に足す。

## 実測（2026-09-29、VM: Ubuntu 24.04.4 LTS・Lima 2.2.0 の vz・4 vCPU / 8 GiB / 40 GiB・画面なし）

確認は「AI アプリの代わりの窓」（`scripts/fake-ai.py`。AT-SPI に出る版と、`NO_AT_BRIDGE=1` で出ない版）と実物の Cursor で行った。
本人の操作の代わりに xdotool（X11 の移動・押す）と AT-SPI（同意の小窓・画面共有の確認のボタン）を使った。証拠の画面と、本文を抜いた
行の記録は neurafusion-repo の `Claude outputs/dk08-linux-2026-09-29/`（前の担当の分）と、その下の `remeasure-dk-linux/`（測り直しの分）。

| セッション | 動いたデスクトップ環境（実測） | 確かめたこと | 結果 |
|---|---|---|---|
| X11（GDM から入った本物のセッション） | **Ubuntu on Xorg**: GDM 46.2 の自動ログイン（logind: seat0・`Service=gdm-autologin`・`Type=x11`・`Class=user`、`DESKTOP_SESSION=ubuntu-xorg`）、gnome-session（`--session=ubuntu`）＋ GNOME Shell 46.0（mutter 46.2）、Xorg 21.1.12（modesetting on vkms・1024×768） | 右下に出る・移動・大きさの変更についていく（geometry 7 行）、対象外・最小化・アプリのオフで隠れる（hidden 6 行）、押すまで読まない（押す前の read 0 行）、押す → AT-SPI 173 字（入力欄の文字は含まない）、読めない版 → 同意を断る → `consent-declined`（OCR の数は増えない）→ 同意 → そのウィンドウだけを撮って OCR 191 字、`read-log` は数だけ、同意の小窓は前面で受け付け（2 回とも） | 通った |
| X11（同上）＋ Node 側 | 同上。Node 24.21（DK-09 の AppImage の同梱品）で `host.ts` を `overlay start` と同じ順に起動（`scripts/vm-node-host.ts`）、既定の対応アプリ一覧 | 実物の **Cursor 3.22.12** の右下に丸 → 押す → AT-SPI は空（Electron は支援技術が有効と伝わったときだけ木を作る）→ 同意 → OCR 45 字（`[host] 読み取り: cursor ocr 読めた 45字`）、記録ファイルに本文なし | 通った |
| X11（素の GNOME） | GNOME Shell 46.0（`--x11`・session mode ubuntu）on Xorg 21.1.12（dummy ドライバ 1920×1080） | 上と同じ項目（AT-SPI 173 字・OCR 194 字） | 通った |
| Wayland（素の GNOME） | GNOME Shell 46.0（mutter 46.2、`--headless --wayland --virtual-monitor 1920x1080`）＋ Xwayland 23.2.6、xdg-desktop-portal 1.18.4 / -gnome 46.2、PipeWire 1.0.5 | 丸は作業領域の右下に固定（`fixed:true`）、押す → 同意を断る → 撮らない、同意 → 「Share Screen」で Share → PipeWire から1枚 → OCR 201 字（答えあり・**パネルの文字なし**）、画面全体でも同じ（190 字・パネルの文字なし）、同意 → Cancel → `screen-denied`（数えない）、全体のオフで隠れる、同意の小窓は前面 | 通った |
| Wayland（同上）＋ Node 側 | 同上。`vm-node-host.ts` | `丸を起動しました（Wayland: 画面の右下に固定・…・画面の撮影: 使える…）` → 押す → 同意 → 画面全体で共有 → `[host] 読み取り: * ocr 読めた 190字`、記録ファイルに本文なし | 通った |
| Wayland（GDM から入った本物のセッション） | **Ubuntu**: GDM 46.2 の自動ログイン（logind `Type=wayland`・`Class=user`、`DESKTOP_SESSION=ubuntu`）、GNOME Shell 46.0（mutter 46.2・ドックとトップバーあり）＋ Xwayland 23.2.6（使われたら起こす）、vkms 1024×768。**VM では差し込み `scripts/vm-nopulsex.c` を入れて起動した**（下の注） | 丸は作業領域（x66 y32 958×736）の右下に固定、押す前の read 0、押す → 同意を断る → 撮らない、同意 → 画面共有の確認で Share → OCR 209 字（答えあり・パネルの文字なし）、もう一度（Entire Screen）→ 209 字（パネルの文字なし）、Cancel → `screen-denied`、全体のオフで隠れる、同意の小窓は前面（4 回とも） | 通った |
| Wayland（同上）＋ Node 側 | 同上。実物の **Cursor 3.22.12**（既定の起動で `--ozone-platform=wayland` = Wayland の窓・最大化） | `丸を起動しました（Wayland: 画面の右下に固定・AT-SPI: 使えない・画面の撮影: 使える・文字認識: ある）` → 丸は Cursor の窓の上に出た → 押す → 同意 → 画面全体で共有 → `[host] 読み取り: * ocr 読めた 43字`、記録ファイル（reads.json 9 行）に本文なし | 通った |

- 本物のセッションは、画面の装置が無い VM に仮想の画面ドライバ vkms（`linux-modules-extra`）を読み込み、GDM の自動ログインで入った（`scripts/vm-gdm-session.sh`）。
  mutter は vkms を試験用として無視する（`61-mutter.rules` の `mutter-device-ignore`。後の規則で外しても TAGS に残る）ので、VM では vkms の行を抜いた同名の規則を `/etc/udev/rules.d/` に置いた。
- GDM の Wayland が止まる理由（gdb で確認）: GNOME Shell の主スレッドが音量の部品（libgvc → libpulse の `pa_client_conf_from_x11`）の中で、
  自分の X 画面（Xwayland は「使われたら起こす」）へ同期でつなぎに行き、Xwayland はシェルの応答を待つ、という待ち合わせ。丸とは関係ない。
  この VM は ubuntu-desktop を全部は入れていない（ibus も無い）。ibus を入れる・mutter の `autostart-xwayland`・KMS の simple はどれも効かなかった。
  `/etc/pulse/client.conf.d/` の `auto-connect-display = no` も効かない（返事をしない偽の X 画面に対して `pa_context_new` が 6 秒の打ち切りまで戻らなかった。
  X の設定読みは `DISPLAY` があれば必ず行う）。素の headless でも、ibus を入れた間は同じ待ち合わせになった（外すと通った）。
- VM では、libpulse（libpulsecommon）からの `xcb_connect` だけを存在しない画面へ向けてすぐ失敗させる差し込み（`scripts/vm-nopulsex.c`）で避けた。
  `vm-gdm-session.sh wayland` が gcc で作り、`org.gnome.Shell@wayland.service` の drop-in の `LD_PRELOAD` で入れる（`down` で外す）。差し込みは子のプロセスに
  引き継がず、音量の部品が X の画面から読むのはリモートの X 用の設定（`PULSE_SERVER` など）だけなので、丸の確かめ方には影響しない。
  差し込みあり → 約 10〜20 秒で上がる。外す（対照）→ シェルの主スレッドが上の場所で止まり、`ShellVersion` の問い合わせが時間切れ。
  本物の PC でこの止まりが起きるか（なぜこの VM で起きるか）は突き止めていない。証拠の画面は `Claude outputs/dk08-linux-2026-09-29/wayland-gdm-2026-09-30/`。
- 素のセッションでは gnome-session は logind のセッションが無いと上がらない（46 に `--builtin` は無い）ので、gnome-shell を直接動かした（`scripts/vm-session.sh`）。
- Wayland の Screenshot（interactive）ポータルは、この VM では毎回失敗した（GNOME Shell 46 の撮影画面が、画像を書き終える前に「閉じた」を返し、ポータルが code 2 を返す。ソフトウェア描画で撮影が遅いため）。そのため ScreenCast を主にした。
- この VM では xdg-desktop-portal-gnome が画面共有の途中で落ちることがあった（GTK4 の中で segfault。`GSK_RENDERER=cairo` と、PipeWire を gnome-shell より先に起動することで確認の流れは通った）。
  ポータル本体の最初の応答は約 21 秒（GTK 側のバックエンドの起動待ちが時間切れになるまで）。2 回目からは 13 ms。
- 画面共有の確認の「Application Window」の一覧は、.desktop に結びつく窓だけを出す（Shell の Introspect で app-id が `window:1` の窓は出ない）。
  代わりの AI に .desktop を置くと一覧に出たが、GTK4 の一覧の項目は AT-SPI の選択に応じず、確認用の押す役では選べなかった（画面全体の共有で確かめた）。

## 未確認（実機で確かめる）

- [ ] 本物の PC（差し込みなし）の GDM「Ubuntu」（Wayland）セッション。VM では差し込みで GNOME Shell の起動の待ち合わせを避けて確かめた（上の表と注）
- [ ] 画面共有の確認で「Application Window」を選んでその窓だけを共有する流れ（一覧に出るところまでは確認。選ぶ操作は人の手で）
- [ ] KDE Plasma・Xfce 等の他のデスクトップ
- [ ] HiDPI（拡大率 2 など）での丸の位置。今は拡大率 1 だけを確かめた（`scale` は常に 1.0 を出す）
- [ ] Cursor 以外の実物の AI アプリ（Linux 版のあるもの）の `WM_CLASS` と、AT-SPI で答えが読めるか。Cursor は AT-SPI では空だった
- [ ] 撮影＋OCR では入力欄も写る（Mac・Windows と同じく窓全体を撮るため。X11 の OCR にも下書きが出た回がある）。入力欄を除く仕組みは無い
- [ ] 配布（.deb・AppImage）に入れたときの依存と起動（DK-09 の担当が CI の Linux ランナーで作ったものを確かめる）

## 作る・試す

```sh
# OS に依存しない部分（TS-38 Linux 分）。Mac でも流せる
python3 -m unittest discover -s apps/nf-overlay-linux/tests > /tmp/nf-ovl-test.log 2>&1; echo EXIT=$?
# Node 側（Linux の行を受ける分を含む）
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts src/overlay/overlay.test.ts
# VM の中で（確認用の GNOME を立ててから流す。どちらも /tmp/nf-session.env を書く）
apps/nf-overlay-linux/scripts/vm-session.sh x11        # 素の GNOME（wayland / down も）
apps/nf-overlay-linux/scripts/vm-gdm-session.sh x11    # GDM の自動ログインで「Ubuntu on Xorg」（down で戻す）
apps/nf-overlay-linux/scripts/vm-gdm-session.sh wayland  # 同じく「Ubuntu」（Wayland。差し込みを作って入れる。要 gcc・libc6-dev）
OUT=/tmp/nf-x11 apps/nf-overlay-linux/scripts/vm-x11-check.sh
OUT=/tmp/nf-wl  apps/nf-overlay-linux/scripts/vm-wayland-check.sh
# Node 側から（Mac で 1 本にまとめ、VM の Linux 用 Node で動かす）
node_modules/.bin/esbuild apps/nf-overlay-linux/scripts/vm-node-host.ts --bundle --platform=node --format=esm --outfile=<共有先>/vm-node-host.mjs
NF_OVERLAY_BIN=apps/nf-overlay-linux/nf-overlay node <共有先>/vm-node-host.mjs 60
```

実行に要る OS のパッケージは [apps/nf-overlay-linux/README.md](../apps/nf-overlay-linux/README.md)。
