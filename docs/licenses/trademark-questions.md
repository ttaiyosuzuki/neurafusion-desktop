# 弁護士への質問（2026-09-30）

原文を読んで決まることは `components.md` で決めた。弁護士に聞くのは商標の 1 問だけ（オーナー決定 2026-09-30）。

前の版の 2 節（Microsoft の .NET の条件の「利用者の同意」）は外した: Windows のインストーラに原文を表示して「同意する」を押してもらう画面で対応する（`components.md` 4 節）。

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
    「OpenClaw」もロブスターも無い。アプリ名は「NeuraFusion」、アイコンは NF の丸（2026-10-02 に青から左下 黄 → 右上 紫の4色へ替えた）。
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
   そのまま書いてよいか。「提携・承認の関係に無い」旨の一文は要るか（2026-09-30 に `NOTICE` の先頭へ入れた。外すべきならそう答えてほしい）。
3. CLI の `--help` の `openclaw` の文字列と説明文、管理画面の題名 `OpenClaw Control`、上流のロブスターのアイコンは、
   有料で配る前に直す必要があるか。環境変数名 `OPENCLAW_*` と設定の置き場 `~/.openclaw`（上流と互換の機能上の名前で、利用者には
   ほとんど見えない）は残してよいか。
4. 最初の少数の人（数名・無償・個別に送る）に今の配布物（上の 3 の残りを含む）を渡すことに、商標の点で差し支えがあるか。
   一般公開の前に直せば足りるか。
5. （ついでに）自社の「NeuraFusion」の名前について、先行する登録との衝突の調査と、出願するならどの類か。

### 1.3 こちらの案

- 1 の調査を依頼し、登録の有無にかかわらず次の形にする:
  - 由来の事実はライセンス文書（NOTICE）と README にだけ書き、提携していない旨の一文を置く（`NOTICE` の先頭）。
  - 管理画面の題名・アイコンと `--help` の名前・説明文は NeuraFusion の表記に直す（一般公開の前に。作業は CLI 本体の表記の担当）。
  - 環境変数名 `OPENCLAW_*` と `~/.openclaw` は互換のため残す（説明文にだけ出る名前は直す）。
- 最初の少数の人へは、今の配布物のまま渡す（4 で差し支えがあると言われたら止める）。
