# docs/licenses — 配布物のライセンスの確認（dk-license・2026-09-30）

`docs/desktop-installers-licenses.md`（DK-09・2026-09-29）の「5. 法務確認待ち」の 5 点のうち、原文を読めば決まる 4 部品
（上流 OpenClaw・NSIS・AppImage・Windows Desktop ランタイム）を原文で確かめた。弁護士に聞くのは商標と、
Microsoft の条件の「利用者の同意」の 2 つ（後者は文面を書く仕事なので）。ビルドの台本・`NOTICE`・verify は変えていない。

| ファイル                    | 中身                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `components.md`             | 部品ごとの原文の引用と出典・必要な表示・同梱するファイル・ソースの提供の要否・今の配布物で足りているか |
| `NOTICE.proposed.txt`       | NOTICE の案（今の `NOTICE` は書き換えていない。【連絡先】などの印は配る前に埋める）                    |
| `trademark-questions.md`    | 弁護士への質問: 1 商標、2 Microsoft の条件の利用者の同意（理由つき）                                   |
| `first-recipients-guide.md` | 最初に配る人への案内（Windows の SmartScreen・スマート アプリ コントロール、macOS で初めて開くとき）   |

## DK-09 の法務確認待ち 5 点の行き先

| #   | DK-09 の点                         | 結論                                                                                                                             | 弁護士           |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | 商標（名前・ロゴ）                 | 質問にした（`trademark-questions.md` 1 節）                                                                                      | 要               |
| 2   | 著作権者の書き換えで旧表示も併記か | LICENSE は上流のまま。NOTICE に旧表示（2025 Peter Steinberger）を併記する（義務ではないが、どちらの事実でも条件を満たす）        | 不要             |
| 3   | NSIS の LZMA（CPL 1.0 §3）         | 足りていない一部を NOTICE の案で埋めた（配る者として 4 点を述べる。ソース `nsis-3.13-src.tar.bz2` を保管し、申し出に応じて渡す） | 不要             |
| 4   | AppImage の runtime（LGPL-2.1）    | 今の配布物に AppImage は無い。出す前に版の固定・全文 4 つの追加・ソースを同じ場所に置く・3 年の申し出（`components.md` 3.3）     | 不要             |
| 5   | Windows Desktop ランタイムの DLL   | 5 つのうち 3 つ（と単一ファイルのランタイム）は .NET Library License、1 つは Windows SDK License。表示の追加は作業で直せる       | 要（同意の文面） |

## 配布の担当への作業（この文書の外。台本・NOTICE・verify を持つ担当へ）

1. NOTICE を `NOTICE.proposed.txt` の形にする（【連絡先】を決めてから）。
2. `licenses/` に .NET Library License・Windows SDK License の本文を足し、`README.txt` に NSIS のソースの入手方法（NeuraFusion から）を書く。
3. `NfOverlay.Win.csproj` に `<Copyright>` を足す（`nf-overlay.exe` の `LegalCopyright` が空）。
4. `nsis-3.13-src.tar.bz2`（SHA-256 `a8ffe024602d46b6d766f9e1ce30c324ad2a24daeacd3efc2642d436a0c157ac`）を配布物と一緒に保管する。
5. Linux 版を出す前: type2-runtime の版を固定（`--runtime-file`）・musl／squashfuse／zstd／LGPL-2.1 の全文を足す・ソースを同じ場所に置く。
6. `packaging/installer/はじめにお読みください.txt` の「署名について」を直す（Windows の証明書は今は買わない・Mac は設定の「このまま開く」）。
