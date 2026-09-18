---
name: nf-ability
description: "この人が本当に凄いかを、PC の記録と質問で測る。分身濃度(0-100)と根拠を返す。"
metadata:
  {
    "openclaw":
      {
        "emoji": "🦉",
        "os": ["darwin", "win32", "linux"],
      },
  }
---
# nf-ability（穴掘りフクロウ）

triggers: 「この人は凄い?」「分身濃度」「誰が詳しい」「実力を測って」「合いそうな人の実力」
requires: nf-patternid / nf-usage-tracker / nf-reviewer-score / nf-authenticity（packages/ を参照。コピーしない）

# いつ使うか
利用者が「誰に頼めばいいか」「この人は本当にできるか」と聞いたとき。

# どう使うか
1. patternId で本人の PC 記録を集計する（生値は端末外に出さない。出るのは patternId と集計数値だけ）
2. 記録が無い・薄い人には、コア3質問＋分野別3質問を出す（packages/nf-authenticity/src/verification/）
3. 8源泉の重み付き合計 → 分身濃度（0-100）（packages/nf-reviewer-score/src/channels.ts）
4. 減衰（半減期180日）を掛ける
5. 結果を「濃度 / 根拠の内訳 / 未測定の源泉」の3つで返す。
   未測定を 0 にしない。「測っていない」と言う。

# 言ってはいけないこと
- 測っていない源泉を数字で埋める
- 資格や肩書だけで判定する
- 生の記録（件名・本文・ファイル名）を表示する
