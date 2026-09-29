# NeuraFusion Desktop — 配布形式（DK-09）

Mac は `.dmg`、Windows はインストーラ（`.exe`、NSIS）、Linux は `.deb` と AppImage。
今のデスクトップ版の仕組み（npm tarball を入れる Node CLI ＋ OS ごとの丸の本体）はそのままで、
3 OS とも同じランチャー `packaging/installer/nf-launch.mjs` を同梱の Node 24 で動かす。

## 使い方の流れ

1. **入れる** — `.dmg` から「アプリケーション」へドラッグ／`Setup.exe` を実行（管理者権限なし）／`apt install ./….deb`・AppImage を開く
2. **最初に 1 回だけ許可** — Mac はアクセシビリティ（丸の本体が聞く）。Windows は要らない。Linux の Wayland は押すたびに画面共有
3. **AI アプリの右下に丸** — ランチャーが `neurafusion overlay start` を、同梱の丸の本体（`NF_OVERLAY_BIN`）つきで起動する
4. **押すと 7 区画のパネル**

初回に開いたとき（Windows はインストールの途中）に、同梱の npm で本体の tarball を本人のデータの置き場に入れる
（Mac `~/Library/Application Support/NeuraFusion/cli/<版>`、Windows `%LOCALAPPDATA%\NeuraFusion\cli\<版>`、
Linux `~/.local/share/neurafusion/cli/<版>`）。2 回目からは入れ直さない。自動更新（DK-07）の `npm install -g` も
同じ置き場に入る（ランチャーが `npm_config_prefix` と `PATH` を渡す）。

## Node 24 は同梱する（前提にしない）

流れの 1〜4 に「先に Node.js を入れる」段を挟まないため。前提にすると、Node の無い（または 24 未満の）端末では
「入れる」の前に nodejs.org へ行く段が要り、今の zip 版の最初のつまずき（`.command` が「Node.js が入っていません」で止まる）が残る。
同梱の代償は 1 つあたり約 40〜90MB 増えること。Node は MIT ライセンスで再配布でき、`node/LICENSE` を同梱する。
取得は `scripts/nf-dist/fetch-node.sh`（nodejs.org の公式配布物を `SHASUMS256.txt` と照らしてから使う。既定 v24.21.0）。

## 作り方

```sh
# 1. 本体の tarball（約 25 分。npm pack だと @openclaw/ai が同梱されず検査で落ちるので --pnpm-pack）
node scripts/package-openclaw-for-docker.mjs --allow-unreleased-changelog --pnpm-pack
#    （別の場所の tarball を使うなら NF_DIST_TGZ=<パス>）

# 2. Mac（この Mac で。x64 と arm64 の 2 つ。丸の本体は --triple で 1 つずつ作って lipo で universal に）
bash scripts/nf-dist/build-macos-dmg.sh

# 3. Windows（Mac でも作れる。要るもの: makensis（NSIS 3、zlib/libpng）と .NET 8 SDK）
bash scripts/nf-dist/build-windows-installer.sh

# 4. Linux（GitHub Actions の Linux ランナーで。Mac では止まる。入口・パッケージ・出力は README の「Linux 版の作り方」）
bash scripts/nf-dist/build-linux-packages.sh          # 丸の本体は apps/nf-overlay-linux（DK-08）。無ければ NF_LINUX_OVERLAY_DIR

# 5. 中身の確認（TS-38 配布形式。NF_DIST_SMOKE=1 で、同梱の Node で本体を実際に入れて --version まで）
NF_DIST_SMOKE=1 bash scripts/nf-dist/verify-installers.sh            # Mac: dmg と exe、Linux: deb と appimage
```

出力は `.artifacts/installers/`（ignore 下）と `SHA256SUMS.txt`。リリースへの上げは取りまとめ役・本人の確認のあと。

| 形式 | 中身 | 丸の本体 |
|---|---|---|
| `NeuraFusion-Desktop-<版>-macos-{x64,arm64}.dmg` | `NeuraFusion.app`（入口。`LSUIElement`・アクセシビリティの理由つき）＋「アプリケーション」への別名 | `Contents/Resources/NFOverlay.app`（universal） |
| `NeuraFusion-Desktop-<版>-windows-x64-Setup.exe` | `%LOCALAPPDATA%\Programs\NeuraFusion` に入れる。スタートメニュー・「アプリと機能」・アンインストーラ | `overlay\nf-overlay.exe`（.NET ランタイムごと 1 ファイル） |
| `neurafusion-desktop_<版>_amd64.deb` | `/opt/neurafusion`・`/usr/bin/neurafusion-desktop`・`.desktop`。Depends は DK-08 の README の OS パッケージ | `/opt/neurafusion/overlay`（Python + GTK。OS の物を使う） |
| `NeuraFusion-Desktop-<版>-x86_64.AppImage` | 同じ中身を AppRun から | 同上（OS に PyGObject・GTK があること） |

## まだ確かめていないこと（実機・証明書・登録待ち）

- **署名**: Mac はアドホック（Developer ID は Apple Developer Program の登録待ち。登録後は `NF_SIGN_IDENTITY` と
  `docs/overlay-macos-release.md` の公証）。Windows は無署名（証明書の購入待ち。`docs/overlay-windows-signing.md`）。
  それまでは Gatekeeper・SmartScreen の警告が出る。
- **Mac の許可の帰属**: 入口の `.app` → node → 丸の本体の順に起動するので、アクセシビリティの許可は「NeuraFusion」に付く見込み。
  実機の Finder から開いて確かめていない（この環境では GUI の許可を出せない）。arm64 の .dmg は Intel の Mac で作っただけで動かしていない。
- **Windows**: インストーラは Mac で書き出せることと中身（7-Zip で一覧）だけ確かめた。実行・スタートメニュー・完了画面からの起動・
  アンインストールは Windows の実機が要る。起動はコンソールを最小化で開く（隠す仕組みは足していない）。
- **Linux**: Ubuntu 24.04 の VM で `.deb` を apt で入れて Depends が解決すること、`.deb`・AppImage とも同梱の Node で本体を入れて
  `--version` が動くことを確かめた。`overlay start` は、Node 側の Linux 対応（DK-08）が main に入るまで「macOS と Windows だけ」で止まる。
- **初回の準備はインターネットが要る**（tarball の依存を npm の registry から取る。今の zip 版と同じ）。

## 完了報告の対象 ID

DK-01, DK-02, DK-03, DK-04, DK-05, DK-06, DK-07, **DK-08, DK-09**, TS-38（配布形式の検査は `src/overlay/dist.test.ts` と `scripts/nf-dist/verify-installers.sh`）。
