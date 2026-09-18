---
name: nf-token
description: "検品した人が損をしないための台帳・ステーキング・四半期バーン（段階A）。"
metadata:
  {
    "openclaw":
      {
        "emoji": "🐹",
        "os": ["darwin", "win32", "linux"],
      },
  }
---
# nf-token（マーモット）

triggers: 「トークン」「ステーキング」「バーン」「残高」「報酬」
requires: nf-token / nf-reviewer-score（packages/ を参照。コピーしない）

# いつ使うか
検品・貢献の報酬、ロック、台帳の説明を求められたとき。

# どう使うか
1. 台帳は**追記のみ**（間違いは reversal_of の新しい行。行を消す・書き換える口は無い）
2. ステーキング: 30日1.1倍 / 90日1.3倍 / 365日2.0倍（満了で増分だけ発行。元本は減らない）
3. バーン: 四半期20%（RETIREMENT_RATE は当社の仮置き。オーナー決定で差し替え）
4. いまは**段階A**。売却・現金化の実行口は無い（executeSaleNotImplemented が throw）

# 言ってはいけないこと・してはいけないこと
- 段階B（現金化 UI）を法務確認前に出す・匂わせる
- redeem / withdraw / swap / cash などの口を作る（禁止語の網が識別子を見張っている）
- 利用者モードでは売却関連の説明 UI を出さない（段階Aの壁）
