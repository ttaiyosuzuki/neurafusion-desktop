# docs/licenses — 配布物のライセンスの確認（dk-license・2026-09-30）

`docs/desktop-installers-licenses.md`（DK-09・2026-09-29）の「5. 法務確認待ち」の 5 点のうち、原文を読めば決まる 4 部品
（上流 OpenClaw・NSIS・AppImage・Windows Desktop ランタイム）を原文で確かめた。弁護士に聞くのは商標の 1 問だけ（2026-09-30 オーナー決定。Microsoft の条件の「利用者の同意」は、
Windows のインストーラに原文を表示して「同意する」を押してもらう画面で対応する）。NOTICE は 2026-09-30 dk-license-2 で案の形にした。

| ファイル                    | 中身                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `components.md`             | 部品ごとの原文の引用と出典・必要な表示・同梱するファイル・ソースの提供の要否・今の配布物で足りているか |
| `NOTICE.proposed.txt`       | NOTICE の案の残り（AppImage の 5 節だけ。1〜4 節は根の `NOTICE` に入れた）                             |
| `trademark-questions.md`    | 弁護士への質問: 商標の 1 問（Microsoft の条件の同意はインストーラの画面で対応するので外した）          |
| `first-recipients-guide.md` | 最初に配る人への案内（Windows はスマート アプリ コントロールがオフの人だけ、macOS で初めて開くとき）   |

## DK-09 の法務確認待ち 5 点の行き先

| #   | DK-09 の点                         | 結論                                                                                                                             | 弁護士             |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 1   | 商標（名前・ロゴ）                 | 質問にした（`trademark-questions.md` 1 節）                                                                                      | 要                 |
| 2   | 著作権者の書き換えで旧表示も併記か | LICENSE は上流のまま。NOTICE に旧表示（2025 Peter Steinberger）を併記する（義務ではないが、どちらの事実でも条件を満たす）        | 不要               |
| 3   | NSIS の LZMA（CPL 1.0 §3）         | 足りていない一部を NOTICE の案で埋めた（配る者として 4 点を述べる。ソース `nsis-3.13-src.tar.bz2` を保管し、申し出に応じて渡す） | 不要               |
| 4   | AppImage の runtime（LGPL-2.1）    | 今の配布物に AppImage は無い。出す前に版の固定・全文 4 つの追加・ソースを同じ場所に置く・3 年の申し出（`components.md` 3.3）     | 不要               |
| 5   | Windows Desktop ランタイムの DLL   | 5 つのうち 3 つ（と単一ファイルのランタイム）は .NET Library License、1 つは Windows SDK License。インストーラの同意の画面で対応 | 不要（同意の画面） |

## 配布の担当への作業（この文書の外。台本・NOTICE・verify を持つ担当へ）

1. 済（dk-license-2）: NOTICE を案の形にした（【連絡先】= info@taiyosuzuki.com）。
2. 済（dk-license-2）: `licenses/` に .NET Library License の原文（`packaging/installer/licenses/dotnet-library-license.txt`）を足した。
   Windows SDK License は、その対象の `D3DCompiler_47_cor3.dll` を配布物から外したので足さない（`components.md` 4.4）。
   Windows のインストーラに .NET Library License の同意の画面を足した（`components.md` 4.4）。
3. 済（dk-license-2）: `NfOverlay.Win.csproj` に `<Copyright>` を足した。
4. `nsis-3.13-src.tar.bz2`（SHA-256 `a8ffe024602d46b6d766f9e1ce30c324ad2a24daeacd3efc2642d436a0c157ac`）を配布物と一緒に保管する。
5. Linux 版を出す前: type2-runtime の版を固定（`--runtime-file`）・musl／squashfuse／zstd／LGPL-2.1 の全文を足す・ソースを同じ場所に置く・
   `NOTICE.proposed.txt` の 5 節を埋めて NOTICE へ足す。
6. 済（dk-license-2）: `packaging/installer/はじめにお読みください.txt` の「署名について」を直した（Windows は今は無署名・スマート アプリ コントロールが
   オフの人だけ、Mac は Apple の今の手順「このまま開く」）。
