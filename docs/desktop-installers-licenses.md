# NeuraFusion Desktop — 配布物のライセンスと名前（DK-09）

配布物（Mac の `.dmg`・Windows の `Setup.exe`・Linux の `.deb` と AppImage）を外に出す前の確認。確かめた日: 2026-09-29。
入れ方は `scripts/nf-dist/common.sh` の `stage_licenses`・`finish_licenses`、検査は `scripts/nf-dist/verify-installers.sh`
（ライセンス文書と名前・アイコン）と `src/overlay/dist.test.ts`。**法務の判断が要る点は「法務確認待ち」と書き、作業は止めていない。**

## 結論

- 元にした OpenClaw（上流 `openclaw/openclaw`）は **MIT**。LICENSE の全文（末尾に足された独自の 1 行を含む）と、その 1 行が指す
  THIRD_PARTY_NOTICES.md を各配布物に入れた。上流に NOTICE は無い（このリポの NOTICE は NeuraFusion が書いた物）。
- 同梱物ごとの全文も入れた: Node.js（MIT。中の V8・OpenSSL・ICU・npm などの表示を含む）、.NET ランタイム（MIT と第三者の表示）、
  WebView2 SDK（BSD 型）、NSIS（zlib/libpng。LZMA は CPL 1.0 と例外）、AppImage の runtime（MIT。LGPL-2.1 の libfuse を静的に含む）。
  Mac の丸（Swift）は OS の物しか使っておらず、同梱物は無い。Linux の丸の GTK などは OS の物を使い、同梱しない。
- 本体の依存に GPL だけ・AGPL・LGPL・SSPL の物は無い（2 節）。
- 名前・ロゴ: MIT は商標の許諾を含まない。上流に商標・ロゴの方針の文書は見つからなかった。配布物の利用者に見える所（アプリ名・
  アイコン・インストーラの文言・「アプリと機能」の表示名と発行元・デスクトップ項目・`--version`）に上流の名前もロブスターも無い
  ことを検査に入れ、作り直した物で確かめた。**ただし CLI 本体の `--help` と管理画面（Control UI）には上流の名前とロブスターが
  残っている**（CLI 本体の表記で、配布の組み立ての外。4 節。直すかは要判断）。

## 1. 上流の原文

### LICENSE（全文）

出典: <https://github.com/openclaw/openclaw/blob/main/LICENSE>（main `149a41c5a91f`・2026-09-29 12:23 UTC 時点。
SHA-256 `73571b25326281d369087f469842c02444fe39faaecebda4d82ed21ff3a1c29d`。このリポの `LICENSE` とバイト単位で同じ）

```text
MIT License

Copyright (c) 2026 OpenClaw Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Third-party notices for incorporated or adapted code are recorded in
THIRD_PARTY_NOTICES.md.
```

- 末尾の 1 文（Third-party notices …）は上流が 2026-05-27 に足した独自の文
  （commit `bb46b79d3c` "refactor: internalize OpenClaw agent runtime (#85341)"）。MIT の本文は変わっていないが、このため
  GitHub の判定は `MIT` ではなく `NOASSERTION` になる。この文が名前で指す `THIRD_PARTY_NOTICES.md` を LICENSE と同じ所に置く。
- 著作権者の行は 2026-05-21 に `Copyright (c) 2025 Peter Steinberger` → `Copyright (c) 2026 OpenClaw Foundation` に書き換えられた
  （commit `3260da003d` "fix: update mac copyright owner"）。→ 法務確認待ち 2

### THIRD_PARTY_NOTICES.md

出典: <https://github.com/openclaw/openclaw/blob/main/THIRD_PARTY_NOTICES.md>（同じ時点。SHA-256
`c1d1bbc550feee74853eba104e347341569cbbbe37a9f77659993ca0766277d5`。このリポの物と同じ）。
上流に取り込まれたコードの表示 2 件: Pi / pi-mono（MIT、`Copyright (c) 2025 Mario Zechner`）と GitHub Octicons
（MIT、`Copyright (c) 2026 GitHub Inc.`）。それぞれ MIT の全文つき。

### NOTICE

上流の根（81 項目、2026-09-29）に NOTICE は無い。このリポの `NOTICE` は NeuraFusion が書いた物で、NeuraFusion の著作権表示・
由来（「このソフトウェアは OpenClaw を基に作られています。」）・上流の MIT の全文・THIRD_PARTY_NOTICES.md への案内を持つ。

### 商標・ロゴの方針

- 上流のリポジトリの根に TRADEMARK などの商標・ロゴの文書は無い。<https://openclaw.ai> の `/trademark`・`/brand`・`/legal`・
  `/terms` は 404、トップ・`/foundation`・`/security`・`/press` に商標の文言は無い（2026-09-29）。
- 上流の文書で商標に触れるのは改名の経緯だけ（<https://github.com/openclaw/openclaw/blob/main/docs/start/lore.md>）:
  > In January 2026, Anthropic sent a polite email asking for a name change (trademark stuff).
- MIT の許諾は「the Software」を使う・写す・変える・配るなどの権利で、名前やロゴ（商標）を使う許諾は書かれていない（上の全文）。
- 方針（オーナー）: OpenClaw の名前・fork であることは画面に書かない。出してよいのはライセンス文書の中の著作権表示
  （`Copyright (c) 2026 OpenClaw Foundation`）と由来の事実（NOTICE）だけ。→ 法務確認待ち 1

## 2. 同梱物ごとの条件

| 部品 | 入る配布物 | ライセンスと条件（原文の要点） | 入れた物 | 出典 |
|---|---|---|---|---|
| Node.js v24.21.0（node と npm） | すべて | MIT。"The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software." LICENSE は中の 44 部品（V8・OpenSSL（Apache-2.0）・ICU・libuv・npm（Artistic-2.0）ほか）の表示を含む。LICENSE の中の GPL の文は ICU の組み立て用の台本（Autoconf の例外つき）で、バイナリには入らない | 公式配布物の `node/LICENSE` をそのまま（`fetch-node.sh`）と `licenses/node-LICENSE.txt` | <https://github.com/nodejs/node/blob/v24.21.0/LICENSE> |
| .NET 8 ランタイム（`Microsoft.NETCore.App.Runtime.win-x64` 8.0.31） | Windows（丸の本体 `nf-overlay.exe` に自己完結で入る） | MIT（`Copyright (c) .NET Foundation and Contributors`）。第三者の表示 `THIRD-PARTY-NOTICES.TXT`（1,272 行）: "The attached notices are provided for information only." | `licenses/dotnet-runtime-LICENSE.txt`・`dotnet-runtime-THIRD-PARTY-NOTICES.txt`（書き出しに使った版の物を NuGet の置き場から写す） | <https://github.com/dotnet/runtime/blob/main/LICENSE.TXT> |
| Windows Desktop ランタイム（`Microsoft.WindowsDesktop.App.Runtime.win-x64` 8.0.31。WPF・Windows Forms） | Windows（同上） | MIT（pack の `LICENSE`）。pack にはネイティブの `D3DCompiler_47_cor3.dll`・`vcruntime140_cor3.dll`・`wpfgfx_cor3.dll`・`PenImc_cor3.dll`・`PresentationNative_cor3.dll` も入る → 法務確認待ち 5 | `licenses/dotnet-windowsdesktop-LICENSE.txt` | <https://github.com/dotnet/wpf/blob/main/LICENSE.TXT> |
| WebView2 SDK（`Microsoft.Web.WebView2` 1.0.2903.40） | Windows（丸のパネル） | BSD 型: "Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution." ほかに第三者の表示 `NOTICE.txt` | `licenses/webview2-LICENSE.txt`・`webview2-NOTICE.txt` | <https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.2903.40> |
| NSIS 3.13（インストーラの実行部分。圧縮は LZMA） | Windows（`Setup.exe`） | "All NSIS source code, plug-ins, documentation, examples, header files and graphics, with the exception of the compression modules and where otherwise noted, are licensed under the zlib/libpng license." / "The LZMA compression module for NSIS is licensed under the Common Public License version 1.0." と "SPECIAL EXCEPTION FOR LZMA COMPRESSION MODULE"（組み込んだ側のコードは CPL にならない）。CPL 1.0 §3 は目的コードで配るとき "states that source code for the Program is available from such Contributor, and informs licensees how to obtain it" を求める → 法務確認待ち 3 | `licenses/nsis-COPYING.txt`（NSIS の COPYING をそのまま）。一覧（`licenses/README.txt`）にソースの場所 <https://nsis.sourceforge.io/Download> | <https://nsis.sourceforge.io/License> |
| Swift（Mac の丸 `nf-overlay`） | .dmg | 同梱物なし。`otool -L` は `/System/Library/Frameworks` と OS の `/usr/lib/swift` だけ、SwiftPM の依存も無い。Swift 自体は Apache-2.0 と "Runtime Library Exception"（"you may redistribute such product without providing attribution as would otherwise be required by Sections 4(a), 4(b) and 4(d) of the License."） | なし | <https://github.com/swiftlang/swift/blob/main/LICENSE.txt> |
| AppImage の runtime（type2-runtime。AppImage の先頭の実行部分） | AppImage | MIT（`Copyright (c) 2004-23 probonopd`）。"The AppImage runtime executable contains statically linked code from the following third party libraries": musl libc・libfuse（LGPL-2.1）・squashfuse・libzstd・zlib → 法務確認待ち 4 | `licenses/appimage-type2-runtime-LICENSE.txt`（上流の LICENSE をそのまま。`packaging/installer/licenses/`） | <https://github.com/AppImage/type2-runtime/blob/main/LICENSE>（LICENSE の最終変更 `4cac606d` 2023-04-16） |
| GTK・PyGObject・Tesseract など（Linux の丸） | .deb・AppImage | 同梱しない（.deb は `Depends` で OS の物、AppImage も OS にある前提）。LGPL の物をこちらから配ることは無い | なし | `scripts/nf-dist/build-linux-packages.sh` |
| 本体の npm tarball（`neurafusion-<版>.tgz`） | すべて | `license: MIT`。tarball の中に `LICENSE`・`NOTICE`・`THIRD_PARTY_NOTICES.md` がある。同梱する依存（`bundleDependencies`）は `@openclaw/ai`（MIT）だけ | tarball ごと | `package.json` |
| 本体の依存（初回の準備で利用者の npm が registry から取る物。配布物には入らない） | — | 330 パッケージ（入った先の package.json 456 件）: MIT 240・ISC 27・BSD-3-Clause 17・Apache-2.0 16・BSD-2-Clause 15・BlueOak-1.0.0 6・MPL-2.0 4・MIT OR Apache 2・0BSD 1・Unlicense 1・(MIT AND Zlib) 1・MIT AND MPL-2.0 1・(MIT OR GPL-3.0-or-later) 1（jszip。MIT を選べる）・license 欄なし 58（すべて本体の中の拡張 `@openclaw/*` 2026.9.4 の package.json で、本体の MIT の中）。**GPL だけ・AGPL・LGPL・SSPL の物は無い。** MPL-2.0 は `@ubjs/core`・`@ubjs/node`・`@ubjs/node-darwin-x64`・`web-push`、MIT AND MPL-2.0 は `@trycua/cua-driver-darwin-x64`（改変して配るときにソースの提供が要る。こちらからは配らない） | — | 2026-09-29 に x64 の .dmg から使い捨ての HOME に入れて数えた |

## 3. 各配布物のどこに入れたか

中の名前は ASCII（Mac の HFS+ は日本語の名前を NFD に変え、.app の署名の封と食い違うため）。
`licenses/README.txt` は部品と全文のファイルの一覧（版つき）、`licenses/ALL.txt` は全部をつないだ 1 つの文書。

| 配布物 | 場所 | 利用者に見える所 |
|---|---|---|
| `.dmg` | `NeuraFusion.app/Contents/Resources/` の `LICENSE`・`NOTICE`・`THIRD_PARTY_NOTICES.md`・`licenses/`（`node-LICENSE.txt`・`README.txt`・`ALL.txt`）・`node/LICENSE` | 開いた窓の「ライセンス.txt」（= `ALL.txt`: NOTICE・LICENSE・THIRD_PARTY_NOTICES.md・一覧・Node.js の全文） |
| Windows `Setup.exe` | インストール先 `%LOCALAPPDATA%\Programs\NeuraFusion\` の `LICENSE`・`NOTICE`・`THIRD_PARTY_NOTICES.md`・`licenses\`（node・.NET 3・WebView2 2・NSIS・一覧・`ALL.txt`）・`node\LICENSE` | インストール先のフォルダ |
| `.deb` | `/usr/share/doc/neurafusion-desktop/copyright`（= `ALL.txt`。Debian の決まりの場所）・`/opt/neurafusion/` の `LICENSE`・`NOTICE`・`THIRD_PARTY_NOTICES.md`・`licenses/` | `/usr/share/doc/neurafusion-desktop/copyright` |
| AppImage | `opt/neurafusion/` の同じ物と `licenses/appimage-type2-runtime-LICENSE.txt` | （中身を開いたとき） |

## 4. 名前・ロゴの検査

`verify-installers.sh` が配布物の中身で確かめる（`scripts/nf-dist/brand-scan.py` で OpenClaw・Clawdbot・Moltbot・Clawd・ClawHub・
🦞 を UTF-8 と UTF-16LE で探す。Windows のインストーラは NSIS の圧縮された見出しを展開して文言・レジストリの値・ショートカット名を見る。
アイコンは `packaging/installer/icons` の物（青い丸）とバイト単位で比べる）。

| 配布物 | 見る所 |
|---|---|
| `.dmg` | ボリューム名・窓と `.app` に並ぶファイル名・`Info.plist`（入口と丸の名前・アクセシビリティの理由・著作権の欄）・はじめにお読みください.txt・入口と丸の本体の中の文字・アイコン（`CFBundleIconFile`）・窓と `.app` の中の画像すべて・（NF_DIST_SMOKE=1）`--version` と `--help` |
| `Setup.exe` | インストーラの文言・「アプリと機能」の表示名（`DisplayName`）と発行元（`Publisher`）・ショートカット名（NSIS の見出し）・版情報（製品名・説明・著作権）・入れるファイルの名前・丸の本体 `nf-overlay.exe`（製品名・会社名・中の文字）・アイコン・入れる画像すべて |
| `.deb`・AppImage | パッケージの説明・デスクトップ項目（`Name`・`Comment`）・入口・AppRun・README・アイコン・画像・（NF_DIST_SMOKE=1）`--version` と `--help` |

2026-09-29 に作り直した物の結果は `tools/agent-tasks/2026-09-29_dk-dist_result.md`。配布の組み立ての層（上の表）はすべて ok。
**残っている所（CLI 本体の表記。配布の組み立ての外）**:

- `--help`（最上位だけで 30 か所）: `Usage: openclaw [options] [command]`、例の `openclaw onboard` など、コマンドの説明
  （"Manage OpenClaw plugins and extensions" など）、環境変数名 `OPENCLAW_*`・設定の置き場 `~/.openclaw`、`ClawHub`。
  `--version` は `NeuraFusion 2026.9.6 (<commit>)` で問題ない。検査はこの 1 項目を NG と出す。
- 管理画面（Control UI、ブラウザで開く物。本体の tarball の `dist/control-ui/`）: 題名 `OpenClaw Control`・`manifest.webmanifest` の
  `"name": "OpenClaw Control"`・アイコンは上流のロブスター（`favicon.svg` は上流の `ui/public/favicon.svg` と同じ物）。

直すなら CLI 本体の表示の言い換え（`src/cli/program/help.ts` の `CLI_NAME`・例・各コマンドの説明、`ui/` の題名とアイコン）。
環境変数名と `~/.openclaw` は機能上の名前で、変えると設定の置き場が上流・既存の利用者と食い違う。→ 要判断（オーナー）

## 5. 法務確認待ち（作業は止めていない）

1. **商標**: 「OpenClaw」の名前とロブスターのロゴの商標登録の有無と範囲。ライセンス文書の中の著作権表示と由来の書き方
   （NOTICE の「このソフトウェアは OpenClaw を基に作られています。」）がそれで足りるか。
2. **著作権表示**: 上流は 2026-05-21 に著作権者を `Peter Steinberger`（2025）から `OpenClaw Foundation`（2026）に書き換えた。
   2025 年の版に由来する部分について、旧表示も併記するか。
3. **NSIS の LZMA（CPL 1.0 §3）**: 目的コードで配るときの「ソースを入手できる」旨 — 一覧にソースの場所を書いた。これで足りるか。
   （zlib で圧縮すれば CPL の部分は入らないが、インストーラが大きくなる）
4. **AppImage の runtime**: LGPL-2.1 の libfuse を静的に含む runtime を配る義務（利用者が組み直せるようにする手段）。runtime は
   公開の OSS で、`appimagetool` の continuous 版が組み立ての時に取る。版（commit）を固定し、ソースの場所と版を
   `licenses/` に書くのがよい（CI の Linux ランナーで作るときに）。
5. **Windows Desktop ランタイムのネイティブ DLL**（`D3DCompiler_47_cor3.dll`・`vcruntime140_cor3.dll` など）: pack には MIT の
   `LICENSE` だけが入っている。別の条件があるか。

## 出典（2026-09-29 に確認）

- 上流: <https://github.com/openclaw/openclaw>（`LICENSE`・`THIRD_PARTY_NOTICES.md`・`docs/start/lore.md`）・<https://openclaw.ai>
- Node.js: <https://github.com/nodejs/node/blob/v24.21.0/LICENSE>・<https://nodejs.org/dist/v24.21.0/>
- .NET: NuGet の runtime pack（`microsoft.netcore.app.runtime.win-x64` と `microsoft.windowsdesktop.app.runtime.win-x64` 8.0.31）の `LICENSE.TXT`・`THIRD-PARTY-NOTICES.TXT`・`LICENSE`
- WebView2: NuGet の `microsoft.web.webview2` 1.0.2903.40 の `LICENSE.txt`・`NOTICE.txt`
- NSIS: <https://nsis.sourceforge.io/License>（brew の makensis 3.13 の `share/nsis/COPYING` と同じ）
- Swift: <https://github.com/swiftlang/swift/blob/main/LICENSE.txt>
- AppImage: <https://github.com/AppImage/type2-runtime/blob/main/LICENSE>
