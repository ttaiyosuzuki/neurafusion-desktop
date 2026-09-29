# NF 右下の丸 — Mac（DK-01・DK-02・DK-04・DK-05・DK-07・TS-38 の Mac 分）

AI アプリ（Claude・ChatGPT のデスクトップ版、Cursor、Notion）の前面のウィンドウの右下に、小さな丸を重ねる。
丸を押したときだけ、そのウィンドウの答えを読み（AX → 読めなければ毎回の同意のうえで Vision の文字認識）、
検品パネルを小窓で開く。約束（Node ⇄ ネイティブ）は [overlay-protocol.md](overlay-protocol.md)。

## 構成

| 場所 | 役目 |
|---|---|
| `src/overlay/apps.ts` | 対応アプリ（tools.yaml の Tier 1。bundle id は実機で確かめた値だけ・出どころつき） |
| `src/overlay/settings.ts` | アプリごとのオン・オフ（既定: 対応アプリだけオン）・パネルの URL・`~/.neurafusion/overlay/settings.json` |
| `src/overlay/host.ts` | ネイティブの丸の起動・停止、config の送り直し、read の記録とパネルへの受け渡し |
| `src/overlay/reads.ts` | 「読めた・読めない」の記録（本文なし）と集計、パネルへ本文を渡すかの判定（`scrubPii` を通す） |
| `src/overlay/update.ts` | 起動時の新しい版の確認。本人の了承が無ければ入れ替えない |
| `src/cli/program/register.overlay.ts` | `neurafusion overlay start / apps / enable / disable / panel-url / check-update` |
| `apps/nf-overlay-macos/` | 丸の本体（Swift）。`NFOverlayCore`（純粋な関数・単体テスト）と `NFOverlay`（AppKit・AX・ScreenCaptureKit・Vision・WebKit） |

### なぜ apps/macos（上流の OpenClaw.app）に入れず、独立した小さな SwiftPM にしたか

- `apps/macos/Package.swift` は `swift-tools-version: 6.3` で、この開発機の Command Line Tools（Swift 6.2.3・Xcode なし）では読めない。
  依存（Sparkle・Peekaboo など）も多く、丸の確認のたびに全体を作ることになる。
- 丸は「記録を取るアプリと同じもの」に載せる約束なので、**配布物は同じ1つ**にする: npm の tarball
  （`neurafusion`）の中に `NFOverlay.app` を同梱し、`neurafusion overlay start` で起動する
  （`host.ts` は同梱先 `apps/nf-overlay-macos/NFOverlay.app` を探す。**package.json の `files` とリリースのビルドへの組み込みは未実施**＝
  このブランチの範囲外。今は開発時の `.build/` か `NF_OVERLAY_BIN` で動く）。
  OpenClaw.app（AmbientObserver）側から起動するのは、Xcode のある環境で apps/macos を作れるようになってから
  （`NF_OVERLAY_BIN` で同じ本体を指すだけでよい）。
- Swift 6.2 の CLT には XCTest が無く、Swift Testing の `_Testing_Foundation` の x86_64 モジュールも入っていないため、
  `apps/nf-overlay-macos/scripts/test.sh` がフレームワークの場所を渡し cross-import を切って `swift test` を流す。

## 作る・試す

```
cd apps/nf-overlay-macos
swift build                  # 本体
scripts/test.sh              # TS-38（Mac）: 位置の計算・追従・オン・オフ・押すまで読まない・読めた/読めないの記録・約束
scripts/package-app.sh       # NFOverlay.app（アドホック署名）。配布の署名・公証は overlay-macos-release.md
node scripts/run-vitest.mjs run --config test/vitest/vitest.unit.config.ts src/overlay/overlay.test.ts
```

## 守っていること（指示書 §8）

- 押す前は読まない: 前面のアプリの bundle id と、そのウィンドウの位置・大きさ（AX の Moved/Resized 等の通知）だけを受ける。
  本文（AXValue 等）を読むのは `OverlayState` が `.clicked` のあとに出す `.read` の1回だけ（単体テストで確認）。
- 画面を撮るのは、AX で読めなかったときに**毎回**確認の小窓で本人が「今回だけ撮る」を押したときだけ。撮るのは対象のウィンドウ1つ（`SCContentFilter(desktopIndependentWindow:)`）。画像は保存しない。文字認識は Vision（端末内）。
- 許可のダイアログを出さない: `AXIsProcessTrusted()`・`CGPreflightScreenCaptureAccess()` で有無を見るだけ（`AXIsProcessTrustedWithOptions` の prompt や `CGRequestScreenCaptureAccess` は呼ばない）。
- 読んだ本文: 記録（`~/.neurafusion/overlay/reads.json`）とログには文字数だけ。パネルへは、未接続なら渡さない／手元（127.0.0.1）の画面なら PII を伏せて渡す／外の https の画面は本人が `sendTextToPanel` をオンにしたときだけ伏せて渡す。
- Electron 製のアプリ（Claude・Cursor など）は AX の木を出さないことがあるので、**押したときだけ** `AXManualAccessibility` を設定してから読む。
- パネル: 7区画の Web 部品（mb-core が作成中）と本番の API はまだ無い。URL が無ければ「未接続」を出す。`panel-url` で手元のデモサーバ（neurafusion-repo の `engine/ck/server-entry.ts`、127.0.0.1）を指せる。本番のデータがあるように見せない。

## 許可の宛先（既知の制約）

macOS の許可（アクセシビリティ・画面収録）は「責任を持つプロセス」に付く。`neurafusion overlay start` を**ターミナルから**起動すると、
丸の本体はターミナル（や node を起動したアプリ）の許可で動く（2026-09-29 の起動確認では、許可済みのプロセスから起動したため `ax:true, screen:true` と出た）。
配布では NFOverlay.app 自身を許可の宛先にしたいので、OpenClaw.app など署名済みのアプリから起動する形に寄せる（Developer ID の登録後に実機で確認）。

## 実機で手動確認する項目（許可が要るため自動テストでは行わない）

本人が許可を出したあと、各アプリ（Claude・ChatGPT・Cursor・Notion = 4件）で:
1. 前面にすると右下に丸が出る／対象外のアプリ（Finder 等）では消える
2. ウィンドウを動かす・大きさを変える・別の画面へ移すと丸がついていく
3. `neurafusion overlay disable <id>` → 再起動でそのアプリでは出ない
4. 丸を押す → パネルが開き「読み取った文字: N 文字」が出る。`neurafusion overlay apps` の「読み取り」が ax / ocr / unreadable になる
5. AX で読めないアプリでは、撮る前に確認の小窓が毎回出る。「撮らない」で撮らない
