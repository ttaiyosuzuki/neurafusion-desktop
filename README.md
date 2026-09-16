# NeuraFusion Desktop

**入れる。何もしない。あなたの分野の仕事が降ってきたら、本物です。**

資格でも、経歴でも、フォロワー数でもなく。実際に何をしてきたかで、仕事が回るように。

- サイト: https://neurafusion.jp/fork
- 配布: **[v2026.9.4](https://github.com/ttaiyosuzuki/neurafusion-desktop/releases/tag/v2026.9.4)** — macOS / Windows / Linux
- 状態: 開発中。署名と自動更新はまだありません

---

## これは何か

あなたのPCの中には、あなたの実力の証拠がすでにあります。
どんなファイルを扱ってきたか。どのアプリを、どう使っているか。
誰と、どの分野の話を、どれくらいの頻度と速さで続けてきたか。

**肩書きは名乗れます。実績は盛れます。でも、この記録は名乗れません。**

NeuraFusion Desktop は、それを端末の中だけで読み取り、
**「型」と数値だけを外に出して**、あなたの得意分野に合う仕事を届けます。

## 3つの約束

### 1. データは、あなたのPCから出ません

本文・件名・ファイルの中身・相手の名前は、あなたのPCの中で読み取り、
**そこから一歩も外に出しません**。外に出るのは「型」と数値だけです。
相手が利用者でない場合、その人を特定できる情報は端末から出ません。

送信の直前に**1件ずつ全数検査**します（`nf/payloadGuard.ts`）。
検査に落ちたものは送らず、端末内で破棄します。

### 2. 鍵は、私たちが預かりません

APIキーや認証情報は、**あなたのOSの安全な保管庫**にだけ入ります。
平文で保存されることはありません。当社のサーバには届きません。

### 3. いつでも止められます

道具ごと、フォルダごとに、オンとオフ。**既定はすべてオフ**です。
取り消せば、そこまでの学習も消えます。

詳しくは [THREAT_MODEL.md](./THREAT_MODEL.md) と
[利用規約 第16条の2](https://neurafusion.jp/terms) をご覧ください。

---

## NeuraFusion 独自の部分

上流にはない、この製品のための実装は `nf/` にあります。
**上流の内部に依存していない**ので、上流を追随しても壊れません。

| ファイル | 役割 |
| --- | --- |
| `nf/payloadGuard.ts` | 送信ペイロードの全数検査。生値・識別子の混入を実行時に止める |
| `nf/features.ts` | 分身測定。端末内の観測を patternId と 0〜1 の数値に変え、生値を捨てる |
| `nf/fortress.ts` | 砦画面。そのまま署名／直して署名／余った／足りなかった → correction_log |
| `nf/toss.ts` | Hey Agent のトス受信。接続していない道具からは受け取らない |
| `nf/consent.ts` | 同意スコープ。既定オフ・監査ログ・取り消しで端末とサーバの両方を削除 |
| `nf/server.ts` | NeuraFusion サーバ接続。鍵はOSの保管庫からしか読まない |

```bash
cd nf
npm install
npm test        # 36件
npm run typecheck
```

---

## 上流について

このソフトウェアは [OpenClaw](https://github.com/openclaw/openclaw)（MIT License）を基に作られています。
上流の著作権表示は [NOTICE](./NOTICE) と [LICENSE](./LICENSE) に残しています。
上流の README は [UPSTREAM_README.md](./UPSTREAM_README.md) として保全しています。

**名称の全置換は行っていません。** 理由と方針は [REBRANDING.md](./REBRANDING.md) にあります。
要点だけ書くと、43,109ファイル中28,930ファイルが該当し、
機械的に置換すると依存解決・設定・署名がすべて壊れ、
**上流のセキュリティ修正を取り込めなくなる**ためです。

---

## いまできること／まだできないこと

| | |
| --- | --- |
| **できる** | 3OSの配布（macOS / Windows / Linux）／送信ペイロードの全数検査／分身測定の特徴量化／砦画面のロジック／トス受信／同意スコープと監査ログ／鍵をOS保管庫から読む |
| **まだできない** | 署名（Apple Developer Program と EV コード署名証明書が未取得）／自動更新／ネイティブアプリ（.app / .exe / .AppImage）／実際のローカル走査（OS別の実装がこれから）／サーバとの疎通（本番接続がこれから） |
| **やらない** | DMの自動送信（各社の規約違反）／カメラ・位置情報の読み取り／同意していない人の生データ取得／鍵の預かり |

## 入れかた

**Node.js 24 以上が要ります**（[nodejs.org](https://nodejs.org/) の LTS）。

Node がある方は、これだけです:

```
npm install -g https://github.com/ttaiyosuzuki/neurafusion-desktop/releases/download/v2026.9.4/neurafusion-desktop-2026.9.4.tgz
neurafusion onboard
```

OS別のインストーラを使う場合は [リリースのページ](https://github.com/ttaiyosuzuki/neurafusion-desktop/releases/tag/v2026.9.4) から
お使いのOSのファイルを取ってください。**署名がまだ無いので、macOS は右クリック →「開く」、
Windows は「詳細情報」→「実行」が要ります。** 警告が出るのは正常です。
各アーカイブの「はじめにお読みください」に同じことを書いてあります。
