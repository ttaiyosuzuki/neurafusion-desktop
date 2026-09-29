# 弁護士への質問（2026-09-30）

原文を読んで決まることは `components.md` で決めた。残るのは 1 節の商標と、2 節の Microsoft の条件（利用者の同意）の 2 つ。

## 1. 商標（「OpenClaw」の名前とロブスターのロゴ）

### 1.1 事実

- NeuraFusion Desktop は、公開の OSS「OpenClaw」（<https://github.com/openclaw/openclaw>、MIT License、
  `Copyright (c) 2026 OpenClaw Foundation`）を基に作った有料前提のデスクトップアプリ（Mac の .dmg・Windows の Setup.exe。Linux は後で）。
  ソースのリポジトリ（`ttaiyosuzuki/neurafusion-desktop`）は GitHub で公開されている。
- MIT の許諾は "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software" で、名前・ロゴの
  使用の許諾は書かれていない。
- 上流に商標・ロゴの方針の文書は無い: リポジトリの根（81 項目）に TRADEMARK などの文書は無く、<https://openclaw.ai> の
  `/trademark`・`/brand`・`/legal`・`/terms`・`/brand-guidelines`・`/press-kit` はすべて 404（2026-09-30 に確認）。
- 上流の文書で商標に触れるのは改名の経緯だけ（<https://github.com/openclaw/openclaw/blob/main/docs/start/lore.md>）:
  "In January 2026, Anthropic sent a polite email asking for a name change (trademark stuff)."（旧名は Clawdbot・Moltbot など）
- 登録・出願: 公開のウェブ検索では、日本・米国・EU での「OpenClaw」の登録・出願を確かめられなかった
  （命名会社の事例紹介に、米国で "pre-cleared with counsel" とする記述がある程度。一次の記録ではない）。J-PlatPat・USPTO・EUIPO の
  データベースは引いていない。
- こちらの使い方（2026-09-29 に作り直した配布物で検査済み）:
  - 利用者に見える所（アプリ名・アイコン・インストーラの文言・「アプリと機能」の表示名と発行元・デスクトップ項目・`--version`）には
    「OpenClaw」もロブスターも無い。アプリ名は「NeuraFusion」、アイコンは青い丸。
  - ライセンス文書（LICENSE・NOTICE・THIRD_PARTY_NOTICES.md）には上流の著作権表示 `Copyright (c) 2026 OpenClaw Foundation` と、
    NOTICE の由来の文「このソフトウェアは OpenClaw を基に作られています。 / This software is derived from OpenClaw.」がある。
    公開のリポジトリの README 75 行目にも「このソフトウェアは OpenClaw（MIT License）を基に作られています。」がある。
  - **まだ残っている所**（CLI 本体の表記）: `--help` に最上位だけで 30 か所（`Usage: openclaw …`・例の `openclaw onboard`・
    "Manage OpenClaw plugins and extensions" などの説明・`ClawHub`）、環境変数名 `OPENCLAW_*`、設定の置き場 `~/.openclaw`。
    管理画面（ブラウザで開く Control UI）の題名 `OpenClaw Control` と上流のロブスターのアイコン（`favicon.svg`）。
- オーナーの方針: OpenClaw の名前・fork であることは画面に書かない。出してよいのはライセンス文書の中の著作権表示と由来の事実だけ。

### 1.2 聞きたいこと

1. 「OpenClaw」（文字）とロブスターのロゴ・🦞 について、日本・米国・EU で登録・出願があるか。指定商品・役務（第 9 類・第 42 類など）と
   権利者は誰か。登録が無い場合でも、周知・著名な表示として不正競争防止法 2 条 1 項 1 号・2 号の問題になりうるか。
2. ライセンス文書と README の由来の文（「OpenClaw を基に作られています」）は、商標の使用に当たらない記述的・指名的な使用として
   そのまま書いてよいか。「提携・承認の関係に無い」旨の一文を足すべきか（案は `NOTICE.proposed.txt` の先頭）。
3. CLI の `--help` の `openclaw` の文字列と説明文、管理画面の題名 `OpenClaw Control`、上流のロブスターのアイコンは、
   有料で配る前に直す必要があるか。環境変数名 `OPENCLAW_*` と設定の置き場 `~/.openclaw`（上流と互換の機能上の名前で、利用者には
   ほとんど見えない）は残してよいか。
4. 最初の少数の人（数名・無償・個別に送る）に今の配布物（上の 3 の残りを含む）を渡すことに、商標の点で差し支えがあるか。
   一般公開の前に直せば足りるか。
5. （ついでに）自社の「NeuraFusion」の名前について、先行する登録との衝突の調査と、出願するならどの類か。

### 1.3 こちらの案

- 1 の調査を依頼し、登録の有無にかかわらず次の形にする:
  - 由来の事実はライセンス文書（NOTICE）と README にだけ書き、提携していない旨の一文を足す（`NOTICE.proposed.txt`）。
  - 管理画面の題名・アイコンと `--help` の名前・説明文は NeuraFusion の表記に直す（一般公開の前に。作業は CLI 本体の表記の担当）。
  - 環境変数名 `OPENCLAW_*` と `~/.openclaw` は互換のため残す（説明文にだけ出る名前は直す）。
- 最初の少数の人へは、今の配布物のまま渡す（4 で差し支えがあると言われたら止める）。

## 2. 商標のほかに弁護士が要る点: Microsoft の条件の「利用者の同意」（Windows 版）

### 2.1 理由

原文を読むだけでは決まらず、**利用者に同意させる条件の文面を書く**必要があるため（`components.md` 4 節）。

### 2.2 事実

- Windows 版の丸（`nf-overlay.exe`）は .NET 8.0.31 を単一ファイルで自己完結に含む。Microsoft の説明
  （<https://github.com/dotnet/core/blob/main/license-information-windows.md>）では、単一ファイルに入る .NET ランタイムと
  `PresentationNative_cor3.dll`・`vcruntime140_cor3.dll`・`wpfgfx_cor3.dll` は **.NET Library License**、`D3DCompiler_47_cor3.dll` は
  **Windows SDK License**（ほかは MIT）。NuGet の pack の中の文書と nuspec は MIT としか書いていない（食い違い）。
- どちらの条件も配る者に次を求める: "require distributors and external end users to agree to terms that protect it at least as much as this agreement"、
  "indemnify, defend, and hold harmless Microsoft from any claims, including attorneys' fees, related to the distribution or use of your applications"。
  Windows SDK License はさらに "Display your valid copyright notice on your programs"。
- 今の Windows のインストーラに同意の画面は無い（ようこそ → インストール → 完了）。利用規約（EULA）も無い。
- 一方、Linux の AppImage の runtime は LGPL-2.1 の libfuse を静的に含み、LGPL-2.1 §6 は配る条件が
  "permit modification of the work for the customer's own use and reverse engineering for debugging such modifications" であることを求める
  （Microsoft の条件は逆にリバースエンジニアリングの禁止を利用者に課すことを求める）。対象の配布物は別だが、全部に 1 つの利用規約を使うと食い違う。

### 2.3 聞きたいこと

1. 「利用者に同意させる」は、インストーラの同意の画面（「同意する」を押さないと進まない）で足りるか。サービスの利用規約への同意で代えられるか。
   最初の少数の人に個別に送る段階で要るか。
2. 利用者に課す条件の最小の文面（`NOTICE.proposed.txt` 4 節の案: 技術的な制限の回避・リバースエンジニアリング・表示の削除・単独での共有の禁止を、
   Microsoft の部品にだけ適用する）で足りるか。
3. 補償（indemnify）の義務の範囲と、NeuraFusion が負う危険の大きさ。避けるなら .NET を使わない形に変える方がよいか。
4. 1 つの利用規約で全部の配布物を扱うときの書き分け（Microsoft の部品の禁止事項と、LGPL-2.1 の部品の許可事項）。

### 2.4 こちらの案

- 一般公開の前に、Windows のインストーラに同意の画面（NSIS の `MUI_PAGE_LICENSE`）を足し、Microsoft の部品にだけ適用する短い条件と
  `licenses/` の一覧を示す。利用規約は部品ごとの条件の優先を書く（第三者の部品にはその部品の条件が優先する）。
- 作業で先に直せる物（弁護士を待たない）: `licenses/` に 2 つの条件の本文を足す・`nf-overlay.exe` の版情報に著作権を入れる・
  NOTICE に Microsoft のプライバシーの声明の URL を書く（`components.md` 4.3）。
- 技術の別案（要検証）: UI Automation を COM で呼んで `UseWPF` を外せば、WPF の 4 つの DLL は入らなくなる見込み。ただし .NET ランタイム自体が
  .NET Library License の側なので、同意の要件は残る。
