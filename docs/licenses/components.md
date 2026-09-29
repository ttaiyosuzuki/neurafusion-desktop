# 配布物の 4 部品のライセンス — 原文で確かめた結果（2026-09-30）

対象: 上流 OpenClaw・NSIS（Windows の `Setup.exe`）・AppImage の runtime（Linux）・Windows Desktop ランタイム（.NET）。
Node.js・WebView2・Swift・本体の依存は `docs/desktop-installers-licenses.md`（DK-09）2 節のとおりで、ここでは扱わない。
引用は原文のまま（英語）。「出典」はその場で読んだファイルのパスか URL。

## 先に結論（表）

| 部品 | 必要な表示 | 同梱するファイル | ソースの提供 | 今の配布物で足りているか |
|---|---|---|---|---|
| 上流 OpenClaw（MIT） | LICENSE の著作権表示と許諾文（`Copyright (c) 2026 OpenClaw Foundation`）。末尾の 1 文が指す THIRD_PARTY_NOTICES.md | `LICENSE`（上流とバイト単位で同じ）・`THIRD_PARTY_NOTICES.md`・`NOTICE`・本体 tarball の `dist/control-ui/provider-icons/ATTRIBUTION.md` | 不要（MIT） | **足りている**。旧表示（2025 Peter Steinberger）は義務ではないが、NOTICE に併記するのを勧める（下の 1.3） |
| NSIS 3.13（本体・プラグイン: zlib/libpng） | 不要（バイナリの配布に表示の義務なし。"acknowledgment … would be appreciated but is not required"） | `licenses/nsis-COPYING.txt`（入れている） | 不要 | **足りている** |
| NSIS の LZMA モジュール（CPL 1.0 と例外） | CPL §3 の 4 点: (i) 全 Contributor のための保証の否認 (ii) 責任の除外 (iii) 異なる条件は配る者だけが出す旨 (iv) **ソースを配る者から入手できる旨と入手方法** | `licenses/nsis-COPYING.txt`（CPL の全文を含む） | **要（申し出に応じて渡せる用意と、その案内）**: NSIS 3.13 のソース `nsis-3.13-src.tar.bz2` | **足りていない（一部）**。(iv) は一覧に NSIS の配布ページの URL があるだけで、「NeuraFusion から入手できる」旨が無い。(i)〜(iii) を NeuraFusion として述べた文も無い → NOTICE の案に 4 点の文を入れた |
| AppImage の runtime（type2-runtime: MIT。静的に musl（MIT）・libfuse 3.15.0 に patch（LGPL-2.1）・squashfuse 0.5.2（BSD-2）・zstd（BSD-3）・zlib を含む） | runtime・musl・squashfuse・zstd の著作権表示と許諾文。libfuse が使われていて LGPL-2.1 の対象である旨の目立つ表示 | runtime の LICENSE（入れている）に加え、**musl の COPYRIGHT・squashfuse と zstd の LICENSE・LGPL-2.1 の全文** | **要（LGPL-2.1 §6）**: libfuse 3.15.0 のソースと patch、再リンクできる runtime のソース（type2-runtime の同じ版と組み立ての台本）を、配布物と同じ場所から取れるようにする（§6 d）か、3 年有効の書面の申し出（§6 c） | **足りていない**（ただし今回の配布物に AppImage は無い。Linux 版はオーナー決定で作っていない）。runtime の版も固定していない（appimagetool の continuous 版が組み立ての時に取る）→ Linux 版を出す前に 3.3 の 4 点 |
| Windows Desktop ランタイム（.NET 8.0.31） | （4 節で記入） | | | |

## 1. 上流 OpenClaw

### 1.1 読んだ物

- このリポ: `LICENSE`（24 行、SHA-256 `73571b25326281d3…`）・`THIRD_PARTY_NOTICES.md`（`c1d1bbc550feee74…`）・`NOTICE`（39 行、NeuraFusion が書いた物）
- 上流: `gh api repos/openclaw/openclaw/contents/LICENSE?ref=main`（main `71ef1c5d5483`・2026-09-29T21:30:48Z）。
  **LICENSE・THIRD_PARTY_NOTICES.md ともこのリポとバイト単位で同じ**（SHA-256 が一致）。上流の根に `NOTICE` は無い（404）。
- 上流の LICENSE の履歴（`gh api 'repos/openclaw/openclaw/commits?path=LICENSE'`）は 3 件だけ:

| commit | 日付 | 変更 |
|---|---|---|
| `f6dd362d39` | 2025-11-24 | Initial commit（`Copyright (c) 2025 Peter Steinberger`） |
| `3260da003d` | 2026-05-21 | "fix: update mac copyright owner"。`-Copyright (c) 2025 Peter Steinberger` / `+Copyright (c) 2026 OpenClaw Foundation`。同じ commit で Mac アプリの About の `© 2026 Peter Steinberger — MIT License.` も `© 2026 OpenClaw Foundation — MIT License.` に。CHANGELOG: "Mac app: show OpenClaw Foundation as the About settings copyright owner and align the root MIT license notice." |
| `bb46b79d3c` | 2026-05-27 | "refactor: internalize OpenClaw agent runtime (#85341)"。末尾に 2 行を足した: `Third-party notices for incorporated or adapted code are recorded in` / `THIRD_PARTY_NOTICES.md.` |

### 1.2 条件（原文）

> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

- 表示の義務は「上の著作権表示とこの許諾文」を写し・主要部分に含めること。ソースの提供の義務は無い。
- 末尾の 1 文は条件ではなく案内（"are recorded in"）。ただ、取り込まれた第三者のコード（Pi / pi-mono・GitHub Octicons、ともに MIT）の
  表示の義務はそれぞれの MIT から来るので、THIRD_PARTY_NOTICES.md は LICENSE と一緒に置く（今そうしている）。
- 上流の中にはこのほかにも第三者の表示がファイルと一緒に入っている: 本体 tarball の
  `package/dist/control-ui/provider-icons/ATTRIBUTION.md`（163 行。CodexBar の 52 個のアイコン（`Copyright (c) 2026 Peter Steinberger`、MIT）・
  ggml・LobeHub などの MIT の全文を含む）と、拡張のアイコン（`extensions/*/assets/*.svg`、tarball に 188 項目）の中の注記。
  どれもファイルと一緒に tarball に入っているので足りている。NOTICE の案ではこの場所も案内する。

### 1.3 著作権者の表示の変遷 — 旧い表示も残すべきか

- こちらが受け取った版（fork の元）の LICENSE は `Copyright (c) 2026 OpenClaw Foundation`。MIT の条件の「上の著作権表示」は
  この 1 行で、**LICENSE はこのまま（上流とバイト単位で同じ）にしておくのが正しい**（書き換えない）。
- 2025-11-24〜2026-05-20 の上流のコードは `Copyright (c) 2025 Peter Steinberger` の表示つきの MIT で公開されていた。
  2026-05-21 の書き換えは 1 行の変更で、権利の移転の書面は公開されていない（commit の文言は "update … copyright owner" だけ）。
  もし移転が無かったなら、2025 年に公開された部分の許諾者は今も Peter Steinberger で、その許諾の条件は「2025 年の表示を含める」になる。
- **案: 旧い表示も NOTICE に併記する**（「2026-05-20 までの版は `Copyright (c) 2025 Peter Steinberger` の表示で MIT で公開された」）。
  併記は MIT のどちらの読み方でも条件を満たし、費用も害も無い。LICENSE 自体は変えない。弁護士に聞く必要は無いと判断した
  （表示を足す方向で、どちらの事実でも足りるため）。上流の中の CodexBar のアイコンの表示（2026 Peter Steinberger）は別の物で、そのまま。

## 2. NSIS 3.13（`Setup.exe` の実行部分・プラグイン・圧縮）

### 2.1 読んだ物

- `/usr/local/opt/makensis/share/nsis/COPYING`（brew の makensis 3.13。144 行、CRLF。`/usr/local/opt/makensis/COPYING` と同じ）。
  このリポの `packaging/installer/licenses/nsis-COPYING.txt` とは改行（CRLF→LF）だけが違い、中身は同じ（`diff` 0 行）。
- brew の式（`brew cat makensis`）: `makensis` は `nsis-3.13-src.tar.bz2`（SHA-256 `a8ffe024602d46b6…`）から作り、
  **実行部分（Stubs）とプラグインは公式の Windows 版 `nsis-3.13.zip`（`ba63dffc4410ee89…`）をそのまま入れる**（`resource "nsis"`）。
- 作った `Setup.exe`（`.artifacts/installers/NeuraFusion-Desktop-2026.9.6-windows-x64-Setup.exe`）を `7zz l` で見た:
  `Method = LZMA:23`・`Solid = +`、`$PLUGINSDIR/` に `nsDialogs.dll`・`System.dll`・`nsExec.dll`・`modern-wizard.bmp`、ほかに `uninstall.exe`。
  台本 `packaging/installer/windows/neurafusion.nsi` は `Unicode true`・`SetCompressor /SOLID lzma`・`!include "MUI2.nsh"`。
  → 入る NSIS の部分は、実行部分（`lzma_solid-x86-unicode`。LZMA の展開のコードを含む）・プラグイン 3 つ・MUI の画像、
  アンインストーラ（同じ実行部分）。

### 2.2 条件（原文）

> * All NSIS source code, plug-ins, documentation, examples, header files and graphics, with the exception of the compression modules and where otherwise noted, are licensed under the zlib/libpng license.
> * The LZMA compression module for NSIS is licensed under the Common Public License version 1.0.

zlib/libpng（実行部分・プラグイン・MUI の画像）:

> 1. The origin of this software must not be misrepresented; you must not claim that you wrote the original software. If you use this software in a product, an acknowledgment in the product documentation would be appreciated but is not required.
> 3. This notice may not be removed or altered from any source distribution.

→ バイナリで配るときの表示の義務は無い（3 は「ソースの配布」だけ）。今は COPYING を入れているので十分。

LZMA（CPL 1.0 §3）:

> A Contributor may choose to distribute the Program in object code form under its own license agreement, provided that:
> a) it complies with the terms and conditions of this Agreement; and
> b) its license agreement:
> i) effectively disclaims on behalf of all Contributors all warranties and conditions, … ;
> ii) effectively excludes on behalf of all Contributors all liability for damages, … ;
> iii) states that any provisions which differ from this Agreement are offered by that Contributor alone and not by any other party; and
> iv) states that source code for the Program is available from such Contributor, and informs licensees how to obtain it in a reasonable manner on or through a medium customarily used for software exchange.

> Contributors may not remove or alter any copyright notices contained within the Program.

> SPECIAL EXCEPTION FOR LZMA COMPRESSION MODULE — Igor Pavlov and Amir Szekely, the authors of the LZMA compression module for NSIS, expressly permit you to statically or dynamically link your code (or bind by name) to the files from the LZMA compression module for NSIS without subjecting your linked code to the terms of the Common Public license version 1.0. Any modifications or additions to files from the LZMA compression module for NSIS, however, are subject to the terms of the Common Public License version 1.0.

### 2.3 判断

- CPL の "Contributor" は配る者も含む（CPL 1.0 の定義: "\"Contributor\" means any person or entity that distributes the Program."）。LZMA の展開のコードを目的コードで配る NeuraFusion は §3 の 4 点を満たす。
- (iv) は「ソースは **その配る者から** 入手できる」と書く形。今の `licenses/README.txt` は NSIS の配布ページの URL だけ →
  **NOTICE の案に「NeuraFusion から入手できる（申し出があれば渡す）。公開の場所は …」を足した**。そのため `nsis-3.13-src.tar.bz2`
  （SHA-256 `a8ffe024602d46b6d766f9e1ce30c324ad2a24daeacd3efc2642d436a0c157ac`）を配布物と一緒に保管する（配布の担当の作業。この文書では入れていない）。
- (i)〜(iii) も NOTICE の案に文として入れた（NeuraFusion は全 Contributor のために保証を否認し責任を除外する・CPL と違う条件は
  NeuraFusion だけが出す）。
- LZMA を改変していない（公式の Stubs をそのまま）ので、変更点の表示は要らない。インストーラの台本とデータは例外により CPL にならない。
- 別案: `SetCompressor zlib` にすれば CPL の部分は入らない（インストーラは大きくなる）。案内の文で足りるので今は勧めない。
- **弁護士は要らないと判断した**（条件は文で満たせ、ソースは公開済みの物を保管すればよい）。

## 3. AppImage の runtime（type2-runtime）

### 3.1 読んだ物

- `packaging/installer/licenses/appimage-type2-runtime-LICENSE.txt`（36 行。上流の LICENSE と同じ）: MIT `Copyright (c) 2004-23 probonopd` と
  "The AppImage runtime executable contains statically linked code from the following third party libraries, which are licensed under the following terms:"
  の後に musl・libfuse・squashfuse・libzstd・zlib の **URL だけ**（全文は無い）。
- 組み立て方（<https://github.com/AppImage/type2-runtime>、main `8f39b89e2ac3`・2026-09-28）:
  `scripts/common/install-dependencies.sh` が `fuse-3.15.0.tar.xz`（SHA-256 `70589cfd5e1cff7c…`）を取り、
  **`patches/libfuse/mount.c.diff` を当てて**（`patch -p1`）静的ライブラリ（`meson configure --default-library static`）にし、
  `squashfuse` 0.5.2（`db0238c5981dabbd…`）も作る。土台は Alpine 3.21（`scripts/docker/Dockerfile` の `FROM alpine:3.21`、
  `scripts/chroot/chroot_build.sh` の `ALPINE_RELEASE="3.21.0"`）で、musl・zstd・zlib は Alpine の物。
- 以前作った AppImage（`.artifacts/installers-665fd7a6c/NeuraFusion-Desktop-2026.9.6-x86_64.AppImage`）の先頭 1.5MB の文字列に
  `3.15.0`（FUSE library version）・`Alpine clang version 19.1.4`・上の URL 群がある → libfuse 3.15.0 が静的に入っていることを確かめた。
  runtime の版（commit）は `--appimage-version` を Linux で動かさないと分からない（この Mac では動かない）。
- runtime の配布: type2-runtime の Releases は `continuous`（2026-09-28・`8f39b89e`）と日付の版 `20251108`（2025-12-08・`dd6cebed`）。
  `scripts/nf-dist/build-linux-packages.sh` 109 行目は appimagetool の **continuous 版**を取り、appimagetool がその時の runtime を入れる
  （`--runtime-file` は渡していない）→ 版が固定されていない。
- 静的に入るライブラリの原文:
  - libfuse: <https://github.com/libfuse/libfuse/blob/fuse-3.15.0/LGPL2.txt>（502 行、SHA-256 `dc626520dcd53a22…`）
  - squashfuse: <https://github.com/vasi/squashfuse/blob/0.5.2/LICENSE>（31 行、`9e909cc8a8ba27b1…`）。`Copyright (c) 2012 Dave Vasilevsky`
  - zstd: <https://github.com/facebook/zstd/blob/dev/LICENSE>（dev `01b7154f1172`、30 行、`7055266497633c90…`）。`Copyright (c) Meta Platforms, Inc. and affiliates.`
  - musl: <https://git.musl-libc.org/cgit/musl/plain/COPYRIGHT>（193 行、`b870108ec5e7790e…`）。"musl as a whole is licensed under the following standard MIT license"

### 3.2 条件（原文）

LGPL-2.1 §6（libfuse を静的に含む runtime を配る場合）:

> You must give prominent notice with each copy of the work that the Library is used in it and that the Library and its use are covered by this License.  You must supply a copy of this License.  If the work during execution displays copyright notices, you must include the copyright notice for the Library among them, as well as a reference directing the user to the copy of this License.  Also, you must do one of these things:
> a) Accompany the work with the complete corresponding machine-readable source code for the Library including whatever changes were used in the work (…); and, if the work is an executable linked with the Library, with the complete machine-readable "work that uses the Library", as object code and/or source code, so that the user can modify the Library and then relink to produce a modified executable containing the modified Library.
> c) Accompany the work with a written offer, valid for at least three years, to give the same user the materials specified in Subsection 6a, above, for a charge no more than the cost of performing this distribution.
> d) If distribution of the work is made by offering access to copy from a designated place, offer equivalent access to copy the above specified materials from the same place.

同じ §6 の冒頭: "distribute that work under terms of your choice, provided that the terms permit modification of the work for the customer's own use and reverse engineering for debugging such modifications."

squashfuse（BSD-2）・zstd（BSD-3）: "Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution."

musl（MIT）: 表示の義務がある。免除は "all public header files (include/* and arch/*/bits/*) and crt files intended to be linked into applications" だけで、
静的に入る libc の本体は免除されない。zlib: バイナリの表示の義務なし。

### 3.3 判断（Linux 版を出す前にすること）

今回の配布物（.dmg ×2・Setup.exe）に AppImage は無いので、**今は義務が生じていない**。Linux 版を出す前に次の 4 点が要る:

1. runtime の版を固定する: type2-runtime の日付の版（例 `20251108`）の `runtime-x86_64` を取り、SHA-256 を確かめて
   `appimagetool --runtime-file` で渡す（continuous をやめる）。
2. `licenses/` に足す: LGPL-2.1 の全文・musl の COPYRIGHT・squashfuse と zstd の LICENSE（zlib は任意）、
   それと「この runtime は libfuse 3.15.0（patch あり）を静的に含み、libfuse とその利用は LGPL-2.1 の対象」という目立つ表示
   （NOTICE の案の AppImage の節）。
3. ソースを同じ場所に置く（§6 d）: AppImage を置く所（GitHub Release など）に、`fuse-3.15.0.tar.xz`・`mount.c.diff`・
   固定した版の type2-runtime のソース一式（組み立ての台本を含む。libfuse を差し替えて runtime を作り直せる = 再リンクの手段）を並べる。
   あわせて NOTICE に 3 年有効の申し出（§6 c）も書く（置き場が消えたときの保険）。
4. 利用規約（EULA）を作るなら、runtime の部分について「利用者自身の用途のための改変とそのデバッグのためのリバースエンジニアリング」を
   禁じない（§6 冒頭）。

- **弁護士は要らないと判断した**（LGPL-2.1 §6 の標準の満たし方で、材料はすべて公開の OSS）。
