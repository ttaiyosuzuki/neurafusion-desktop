// NF 検品 — 個人情報の除去（Chrome 拡張の pii.js と同じ規則の移植）。
// 記録に本文を残す前と、（将来の）外部送信の直前に必ず通す。
// 機械的に見つけられる識別子だけを伏せ字にする。氏名・住所の全文検出は行わない
// （誤検出で本文を壊すため）。

export type PiiScrubResult = {
  text: string;
  maskedCount: number;
  kinds: string[];
};

type PiiRule = { name: string; re: RegExp; mask: string };

const RULES: PiiRule[] = [
  // メールアドレス
  { name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, mask: "[メール伏せ字]" },
  // マイナンバー（12桁・区切りあり/なし）
  { name: "mynumber", re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, mask: "[番号伏せ字]" },
  // クレジットカード等の長い数字列（13〜16桁・区切りあり/なし）
  { name: "cardlike", re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,4}\b/g, mask: "[番号伏せ字]" },
  // 日本の電話番号（0始まり・10〜11桁、ハイフン/括弧区切りを含む）
  { name: "phone", re: /(?<!\d)0\d{1,4}[-(（ ]?\d{1,4}[-)） ]?\d{3,4}(?!\d)/g, mask: "[電話伏せ字]" },
  // 郵便番号（〒つき、または 999-9999）
  { name: "postal", re: /〒?\s?\d{3}-\d{4}/g, mask: "[郵便番号伏せ字]" },
];

/** 個人情報らしき識別子を伏せ字に置き換える。 */
export function scrubPii(input: string): PiiScrubResult {
  let out = typeof input === "string" ? input : "";
  let maskedCount = 0;
  const kinds: string[] = [];
  for (const rule of RULES) {
    const before = out;
    out = out.replace(rule.re, () => {
      maskedCount += 1;
      return rule.mask;
    });
    if (out !== before) kinds.push(rule.name);
  }
  return { text: out, maskedCount, kinds };
}
