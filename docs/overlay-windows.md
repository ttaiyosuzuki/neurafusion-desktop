# 右下の丸 — Windows 版（DK-03）

AI アプリのウィンドウの右下に、常に前面の小さな丸を重ねる Windows のネイティブ部品
（`apps/nf-overlay-windows`、実行ファイル `nf-overlay.exe`）の設計・約束・未確認の点。
Node の CLI（`src/overlay/`）とのやりとりは Mac と同じ [overlay-protocol.md](overlay-protocol.md)（dk-mac の担当）に従う。

> 2026-09-29 時点で **Windows の実機では一度も動かしていない**。確かめたのは Mac 上の
> 「OS に依存しないロジックの単体テスト（xUnit）」と「Windows 向けのビルド・`win-x64` の publish が通ること」だけ。

## 動き

| 場面 | Windows での仕組み | 読むもの |
|---|---|---|
| 前面のアプリが変わった | `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` | ウィンドウのハンドルと、そのプロセスの実行ファイルのパス（`QueryFullProcessImageName`）だけ |
| 対象のウィンドウが動いた・大きさが変わった・最小化 | 対象のプロセスに絞った `EVENT_OBJECT_LOCATIONCHANGE`・`EVENT_OBJECT_DESTROY`・`EVENT_OBJECT_CLOAKED/UNCLOAKED` と `EVENT_SYSTEM_MINIMIZESTART/END` | 枠の座標（`DWMWA_EXTENDED_FRAME_BOUNDS`）・モニターの作業領域・DPI |
| 丸の表示 | 層つき窓（`WS_EX_LAYERED \| TOOLWINDOW \| NOACTIVATE \| TOPMOST`）。押してもフォーカスを奪わない | — |
| 丸を押した | `ReadGate` が1回分の印を出す（押した窓・10秒以内・1回きり） | — |
| 答えを読む | ① UI Automation（`System.Windows.Automation`）: 文書の `TextPattern` → 無ければ Text 要素の名前。入力欄（Edit）は読まない ② 読めなければ、**毎回同意の小窓を出し**、はいのときだけ `PrintWindow(PW_RENDERFULLCONTENT)` でそのウィンドウだけを撮り、`Windows.Media.Ocr` で端末内で文字にする | 押したウィンドウ1つ。末尾 20,000 字まで |
| パネル | WebView2 の小窓（380×560 DIP）。`panelMode:"url"` なら `panelUrl` を開き、それ以外・読み込み失敗は「未接続」の表示 | — |

- 押す前は読まない。常時監視しない。受け取る OS のイベントは「前面がどれか」「枠がどこか」だけで、名前・値・文字の変化のイベントは購読しない。
- 撮った画像はメモリの中だけで使い、保存も送信もしない。例外のメッセージも（他のアプリの文字を含みうるので）出さない。
- 設定（`config`）を受け取るまで前面の追跡を始めない。標準入力が閉じたら終了する。

## 約束（overlay-protocol.md との対応）

同じ形: `v:1`、`config`（`apps[].win` = 実行ファイル名の配列・`enabled`・`read`・`panelUrl`・`panelMode`・`ocrConsent`・`size`・`margin`）、
`stop`、`panel-text`、出す側の `ready`・`geometry`（`window`・`dot`）・`hidden`（`not-target` / `disabled` / `no-window`）・
`clicked`・`read`（`ok:true` のときだけ `text`）・`panel`・`error`（`code`・`message`）。

Windows 版で**違う・足した**点（Node 側 `src/overlay/` で受けてほしいこと）:

1. `read.method` は Windows では `"uia"`（Mac の `"ax"` に当たる）/ `"ocr"` / `"none"`。失敗の理由は `"uia-empty"` / `"uia-error"` /
   `"ocr-empty"` / `"ocr-error"` / `"consent-declined"` / `"read-off"`。`read` に各回の結果 `attempts`（方法・ok・文字数・理由。本文なし）を足した。
2. `ready` は `{"platform":"windows","uia":true,"screen":true,"version":…}`。Windows は UI Automation にもウィンドウの撮影にも OS の許可が要らないので常に true。
3. `geometry` に `scale`（DPI/96）と `px`（物理ピクセルの `window`・`dot`）を足した。`window`・`dot` は物理ピクセル ÷ `scale` の論理座標（左上原点）。
4. `hidden` に細かい理由 `detail`（`app-off` / `minimized` / `cloaked` / `too-small` など）と `app` を足した。
5. `apps[].read` は `"uia-only"`・`"uia-then-ocr"` も `"ax-only"`・`"ax-then-ocr"` と同じ意味で受ける。`apps[].win` は `{"exe":[…]}` の形も受ける。
6. 全体のオン・オフ `enabled`（省略時 true）を受ける（Mac の約束には無い。Node が全部オフのときに丸を消すのに使える）。
7. `{"type":"get-read-log"}` を受けると `{"type":"read-log","apps":{…}}`（アプリごとの `uiaOk`・`uiaNg`・`ocrOk`・`ocrNg`・`status`）を返す。
   ネイティブ側も数だけを `%LOCALAPPDATA%\NeuraFusion\overlay\read-log.json` に持つ（次に押したとき、UI Automation で読めないと分かっているアプリは OCR から試すため）。正の記録は Node 側の `reads.json`。

## 対応アプリの実行ファイル名

レジストリ（neurafusion-repo `engine/registry/tools.yaml`）には Windows の実行ファイル名が無い。
推測で埋めないため、このプログラムは既定値を持たず、Node から来た `apps[].win` だけを使う。
2026-09-29 時点で、確かめた Windows の実行ファイル名は **0 件**（Windows 機が無いため）。
実機では「タスク マネージャー → 詳細」で、AI アプリの前面ウィンドウのプロセス名を確かめ、出どころ（確かめた日・版）つきで `src/overlay/apps.ts` に足す。

注意（実機で確かめる）: Microsoft Store 版（MSIX / UWP）のアプリは、前面ウィンドウのプロセスが `ApplicationFrameHost.exe` になることがある。
その場合は実行ファイル名では区別できないので、別の判定（パッケージ名）を足す必要がある。

## 実機で未確認（Windows 10 2004 以降・Windows 11 で確かめる）

- [ ] Node から標準入出力を pipe で起動したとき、GUI サブシステムの `nf-overlay.exe` で標準入出力が通ること
- [ ] 丸が右下に出て、移動・大きさの変更・最小化・別モニターへの移動・DPI の違うモニターについていくこと（件数を報告）
- [ ] 丸を押しても AI アプリの入力欄からフォーカスが外れないこと
- [ ] 丸の絵柄（層つき窓の縁の透け）がブラウザ拡張の丸と同じに見えること
- [ ] アプリごとに UI Automation で答えが読めるか（Electron/Chromium 系は UIA クライアントが来ると読み上げ用の木を作るはず、が未確認）→ `read-log` で「読めた・読めない」を報告
- [ ] UI Automation で読めないアプリで、同意の小窓 → 撮影 → OCR で読めること。`PrintWindow` が黒い画像を返すアプリ（GPU 描画・保護された内容）の有無
- [ ] OCR の言語パック（日本語）が入っていない環境での動き（`TryCreateFromUserProfileLanguages` が null → 日本語 → 英語）
- [ ] WebView2 ランタイムが無い環境（Windows 10 の一部）での動き。配布時に Evergreen ブートストラップを同梱するか
- [ ] 管理者で動くアプリ（`OpenProcess` が拒否され実行ファイル名が空）→ 丸が出ないこと

## ビルド

```sh
# Mac（ビルドだけ。実行はできない）
export DOTNET_ROOT="$HOME/.dotnet"; D="$HOME/.dotnet/dotnet"
$D test  apps/nf-overlay-windows/tests/NfOverlay.Core.Tests > /tmp/nf-ovw-test.log 2>&1; echo EXIT=$?
$D publish apps/nf-overlay-windows/src/NfOverlay.Win -c Release -r win-x64 --self-contained false \
  -p:EnableWindowsTargeting=true -o /tmp/nf-ovw-publish > /tmp/nf-ovw-pub.log 2>&1; echo EXIT=$?
```

署名は [overlay-windows-signing.md](overlay-windows-signing.md)。
