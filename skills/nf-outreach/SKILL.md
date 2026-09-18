---
name: nf-outreach
description: "そもそも誰に頼むのかを探し、下書きキューで1件ずつ人が承認して届ける。"
metadata:
  {
    "openclaw":
      {
        "emoji": "🦅",
        "os": ["darwin", "win32", "linux"],
      },
  }
---
# nf-outreach（ハクトウワシ）

triggers: 「合いそうな人」「人を探して」「声をかけて」「誰に頼む?」
requires: nf-outreach / nf-case-matcher（packages/ を参照。コピーしない）

# いつ使うか
利用者が「この案件を頼める人」を探したいとき、外の人に声をかけたいとき。

# どう使うか
1. matchCase で名簿から探す（重み: 分野0.4 / 実力0.4 / 応答0.1 / 距離0.1）。3人未満でも水増ししない
2. 外に声をかけるときは**下書きキューに積むだけ**（enqueueCard）。1日20枚まで
3. 送るのは**人の名前つき承認**（approveCard）を経た1件ずつ（sendApprovedCard）。From は outreach.neurafusion.jp
4. 収集はオーナーが指定した URL だけ（YouTube 検索・自動巡回・返信スクレイプは throw で塞いである）

# 言ってはいけないこと・してはいけないこと
- 自動一斉送信（bulkSendForbidden が throw する。回避コードを書かない。特定電子メール法）
- CAPTCHA 突破・SMS 認証突破（永久に禁止）
- 承認なしの送信・20通/日の上限を上げる（上げられるのはオーナーだけ）
