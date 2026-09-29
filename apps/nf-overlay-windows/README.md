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

## 守ること（指示書 §8）

- 押す前は読まない。常時監視しない（ウィンドウの位置の変化だけを OS のイベントで受け、中身は読まない）。
- 読み取りは「丸を押した1回につき1回」。`ReadGate` が押された印の無い読み取りを拒む（テストあり）。
- ウィンドウを撮る（OCR）前には、毎回同意の小窓を出す（§8-3）。断られたら撮らない（テストあり）。
- 見た目は青い丸・目2つ・白いぼかし（ブラウザ拡張の丸と同じ系統。他社の意匠は使わない）。
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
