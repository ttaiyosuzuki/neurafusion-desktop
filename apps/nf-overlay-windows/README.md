# nf-overlay-windows — AI アプリの右下の丸（Windows 版・DK-03）

NeuraFusion デスクトップ版の Windows 側ネイティブ部品。前面にある対応 AI アプリのウィンドウの右下に、
常に前面の小さな丸の窓を重ね、移動・大きさの変更についていく。丸を押したときだけ答えを読み、
7区画のパネル（WebView2）を小さな窓で開く。

> **状態（2026-09-29）**: Windows の実機が無いため、Windows 上では一度も動かしていない（未実測）。
> Mac の上でできたのは「OS に依存しないロジックの単体テスト」と「Windows 向けのビルドが通るか」まで。
> 実機で確かめる項目は [docs/overlay-windows.md](../../docs/overlay-windows.md) の「実機で未確認」に列挙する。

## 構成

| パス | TFM | 中身 |
|---|---|---|
| `src/NfOverlay.Core/` | `net8.0` | OS に依存しない純粋なロジック。約束（JSON 1行）、対応アプリの判定、オン・オフ、丸の位置の計算、移動への追従、押すまで読まない門、読めた・読めないの記録 |
| `src/NfOverlay.Win/` | `net8.0-windows10.0.19041.0` | Windows 固有。前面ウィンドウの追跡（SetWinEventHook）、丸の窓（WinForms・層つき窓）、UI Automation の読み取り、ウィンドウだけの撮影＋Windows.Media.Ocr、パネル（WebView2） |
| `tests/NfOverlay.Core.Tests/` | `net8.0` | xUnit。TS-38（Windows 分）。Mac でも流れる |

## Node との約束（標準入出力・JSON 1行ずつ）

Node の CLI（`src/overlay/`、dk-mac の担当）がこの実行ファイルを起動し、標準入力に設定を送る。
形は dk-mac の [docs/overlay-protocol.md](../../docs/overlay-protocol.md)（Mac と共通）に合わせた。
Windows 版の設計と、約束との差は [docs/overlay-windows.md](../../docs/overlay-windows.md)。

- 受け取る: `config` / `stop` / `panel-text` / `get-read-log`（知らない type は読み飛ばす）
- 出す: `ready` / `geometry` / `hidden` / `clicked` / `read` / `panel` / `read-log` / `error`（どれも `"v":1`）
- 読んだ生の文字は、読めたときの `read` の1行でだけ Node に渡す。Node が PII を除いて `panel-text` で返したものだけをパネルに出す。
  ネイティブ側の記録（`read-log.json`）と標準エラーには文字数だけで、本文を書かない。

## FF 先読み（FF-01〜08）

約束は [docs/overlay-protocol.md「FF 先読み」](../../docs/overlay-protocol.md)。手を選ぶのは Node で、ここは**全体キーの受け取りと行の描画だけ**。

- 受け取る: `ff-config`（キー・`scopes`・`opacity`）/ `ff-line`（1行。`reset:true` なら前の行を消す）/ `ff-hide`。出す: `ff-key` / `ff-drawn` / `ff-keys`。
- キーは `RegisterHotKey`（見えないメッセージ専用の窓で `WM_HOTKEY` を受ける。キーボードのフックは使わない）。
  `{mods, key}` → `MOD_*`（必ず `MOD_NOREPEAT`）・仮想キーの対応は `FfHotkey`（US 配列の位置。`.` = `VK_OEM_PERIOD` など）。
- `scopes` の `global`（既定は trigger だけ）は ff-config のあいだずっと、`overlay-only`（既定は adopt・close）は**行が出ている間だけ**登録し、隠したら外す。
  試して登録できなかった役目は `ff-keys.failed`（ff-config のたび・行が出て表示中だけのキーを試したとき）。
- 押下の番号 `press` は起動から1ずつ増える。`WM_HOTKEY` を受けた瞬間に `Stopwatch` で刻み、その押下の最初の行を描き終えたら（`OnPaint` の終わり）1回だけ
  `ff-drawn.ms` を出す（FF-08 の 0.8 秒はこの値）。close は Node の `ff-hide` を待たずにすぐ隠して Esc を返す。
- 行の窓（`FfStripForm`）: 常に前面・フォーカスを奪わない・マウス素通し（`WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_LAYERED`、
  `ShowWithoutActivation`）、半透明は `opacity`、主画面の作業領域の下寄り中央。
- 画面共有・録画から隠す API は使わない（FF-07）。
- 状態（押下の番号・行・押下ごとに1回の ff-drawn・scope ごとの登録）は `NfOverlay.Core/FfStrip.cs` で、テストは `FfTests.cs`。
  Windows の実機では未実測（キーの登録・描画の時間・前面の挙動）。

## 守ること（指示書 §8）

- 押す前は読まない。常時監視しない（ウィンドウの位置の変化だけを OS のイベントで受け、中身は読まない）。
- 読み取りは「丸を押した1回につき1回」。`ReadGate` が押された印の無い読み取りを拒む（テストあり）。
- ウィンドウを撮る（OCR）前には、毎回同意の小窓を出す（§8-3）。断られたら撮らない（テストあり）。
- 見た目は NF の丸（左下 黄 → 右上 紫の4色・目2つ・白ふち。2026-10-02 に青い丸から替えた。ブラウザ拡張・Web の丸と同じ。他社の意匠は使わない）。
- 対応アプリの実行ファイル名は Node から受け取る。このプログラムの中に推測の既定値は持たない。

## ビルドとテスト（Mac の上で）

```sh
export DOTNET_ROOT="$HOME/.dotnet"; D="$HOME/.dotnet/dotnet"
$D test apps/nf-overlay-windows/tests/NfOverlay.Core.Tests > /tmp/nf-ovw-test.log 2>&1; echo EXIT=$?; tail -5 /tmp/nf-ovw-test.log
$D build apps/nf-overlay-windows/src/NfOverlay.Win -p:EnableWindowsTargeting=true > /tmp/nf-ovw-build.log 2>&1; echo EXIT=$?; tail -5 /tmp/nf-ovw-build.log
```

Windows では `dotnet publish src/NfOverlay.Win -c Release -r win-x64 --self-contained false` で
`nf-overlay.exe` を作る。署名は [docs/overlay-windows-signing.md](../../docs/overlay-windows-signing.md)。

## Mac 版との差

[docs/overlay-windows.md「約束（overlay-protocol.md との対応）」](../../docs/overlay-windows.md) の 1〜7。
主なもの: `read.method` が `"ax"` ではなく `"uia"`、`ready` が `ax` ではなく `uia`、`geometry` に `scale`・`px` を追加。
