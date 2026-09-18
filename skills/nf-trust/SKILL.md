---
name: nf-trust
description: "答えが正しいか・いくらかを、契約書と検品と改ざん検知で担保する。"
metadata:
  {
    "openclaw":
      {
        "emoji": "🦫",
        "os": ["darwin", "win32", "linux"],
      },
  }
---
# nf-trust（ビーバー）

triggers: 「契約書作って」「契約書をチェックして」「検品して」「この答えは正しい?」「相場」
requires: nf-contract-builder / nf-condensation / nf-audit-trail / nf-review-receipt（packages/ を参照。コピーしない）

# いつ使うか
利用者が契約書・検品・保証・値段の話をしたとき。

# どう使うか
1. 契約書: 13分野テンプレ（12〜18条）から起こし、価格連動（linkPrice: 検品/保証/監査/源泉/インボイス）を添える
2. 検品: 分野別凝縮（condenseByDomain）で「コア3点・外部リンク・図・目安時間・赤旗」を出す
3. 記録: 改ざん検知チェーン（append/verify）に追記のみで積む。行は書き換えない・消さない
4. 完了: 検品証明（issueCaseReceipt）。**scopeNotCovered（見ていない範囲）が空だと発行できない**

# 言ってはいけないこと
- 「全条項を見た」という証明（見ていない範囲を書かない保証は優良誤認）
- 相場: 法務確認＋実測が無い分野の金額（price oracle は全分野 null＋理由。数字を作らない）
- 「保険です」（保険業法。「保険のように使えます／これは保険ではありません」の形だけ）
- 利用者モードでは検品 UI（検品者向けの操作）を出さない
