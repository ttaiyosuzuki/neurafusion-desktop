// NF 検品 — 外部送信の唯一の門番（Chrome 拡張 v0.8.0 と同じ決まり）。
//
// サーバ送信を始めるときは、次の3つを直すまで enabled を true にしない:
//   1. サイトの LIMITS 欄の「記録はブラウザの中にだけ残り、サーバには送らない」の文言
//   2. プライバシーポリシー（https://neurafusion.jp/privacy-extension）
//   3. Chrome ウェブストアの「プライバシーへの取り組み」欄の申告
// 3つとも済んだら prerequisites を true にし、送る直前に必ず scrubPii を通す。

import { scrubPii } from "./pii.js";

export const SERVER_SEND = {
  enabled: false,
  prerequisites: {
    limitsTextUpdated: false,
    privacyPolicyUpdated: false,
    cwsPrivacyUpdated: false,
  },
};

export function serverSendAllowed(): boolean {
  if (!SERVER_SEND.enabled) return false;
  const p = SERVER_SEND.prerequisites;
  return !!(p.limitsTextUpdated && p.privacyPolicyUpdated && p.cwsPrivacyUpdated);
}

export type ReviewSendResult = { ok: false; status: "準備中"; note: string };

/** 外部送信の唯一の口。サーバ未実装＝常に「準備中」（Fail Closed）。 */
export function sendForReview(payload: unknown): ReviewSendResult {
  if (!serverSendAllowed()) {
    void payload;
    return { ok: false, status: "準備中", note: "サーバ側が未実装のため、外部への送信は行いません。" };
  }
  // サーバ実装後もここが唯一の送信口。必ず伏せ字化してから送る。
  const scrubbed = scrubPii(JSON.stringify(payload));
  void scrubbed; // 送信処理は未実装（実装時にここへ）
  return { ok: false, status: "準備中", note: "送信処理は未実装です。" };
}

// 「検品なしで通るか」の表示文（サーバの判定エンジンが返したときだけ使う）
export const NO_REVIEW_YES_TEXT =
  "あなたのパターンは、これまで専門家の確認で無修正で通っています。人の確認なしで進められます（100%の保証ではありません）";
export const NO_REVIEW_NO_TEXT =
  "あなたのパターンは、まだ無修正で通った実績がありません。専門家の確認付きをおすすめします";

export type NoReviewVerdict =
  | { status: "pending"; label: "判定：準備中" }
  | { status: "no"; label: "No"; text: string };

/**
 * 検品なしで通るか（Yes / No）。サーバ未実装の間は「準備中」で Yes は絶対に返さない。
 * 実装後も、サーバの答えが明確な "yes" のとき以外はすべて No（迷ったら No）。
 */
export function queryNoReviewPass(taskId: string): NoReviewVerdict {
  void taskId;
  if (!serverSendAllowed()) return { status: "pending", label: "判定：準備中" };
  return { status: "no", label: "No", text: NO_REVIEW_NO_TEXT };
}
