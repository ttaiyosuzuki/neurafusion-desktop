/**
 * ★NF (c) Hey Agent のトス受信。
 *
 * 案件の通知を、利用者が普段使っている道具（Slack / LINE / Discord）で受ける。
 * 「入れる。何もしない。仕事が降ってきたら本物です」を成立させる部分。
 *
 * ★送信はしない。受けるだけ。
 *   こちらから自動でDMを送ることは実装しない（各社の規約違反・アカウント停止の実損）。
 */

import type { ConsentChannel } from "./consent.js";

/** トスを受けられる道具（同意スコープのうち、通知に使えるもの） */
export const TOSS_CHANNELS = ["slack", "line", "discord", "email"] as const;
export type TossChannel = (typeof TOSS_CHANNELS)[number];

export function isTossChannel(c: ConsentChannel | string): c is TossChannel {
  return (TOSS_CHANNELS as readonly string[]).includes(c);
}

/** 降ってきた案件1件 */
export type Toss = {
  tossId: string;
  /** 分野（台帳の goal_id） */
  field: string;
  /** 1行の要約。**依頼者の生の文章ではなく、当社が作った要約** */
  summary: string;
  /** 目安の作業時間（分） */
  estimatedMinutes: number | null;
  /** 目安の報酬（円）。出典が無いときは null＝「準備中」と出す */
  estimatedYen: number | null;
  /** いつ来たか */
  arrivedAtIso: string;
  /** いつまでに返事が要るか */
  expiresAtIso: string | null;
};

export type TossDecision = "accept" | "decline" | "expired";

/** 画面に出す1件の形 */
export type TossView = {
  toss: Toss;
  /** 「準備中」と出すか（相場の出典が無いとき） */
  priceUnknown: boolean;
  /** 残り時間の文言 */
  remainingLabel: string;
};

function remainingLabel(expiresAtIso: string | null, nowMs: number): string {
  if (!expiresAtIso) return "期限なし";
  const left = Date.parse(expiresAtIso) - nowMs;
  if (Number.isNaN(left)) return "期限なし";
  if (left <= 0) return "期限切れ";
  const h = Math.floor(left / 3_600_000);
  if (h >= 24) return `あと ${Math.floor(h / 24)} 日`;
  if (h >= 1) return `あと ${h} 時間`;
  return `あと ${Math.max(1, Math.floor(left / 60_000))} 分`;
}

export function toTossView(toss: Toss, now = new Date()): TossView {
  return {
    toss,
    /* ★相場の出典が無いものは、推測の金額を出さない */
    priceUnknown: toss.estimatedYen == null,
    remainingLabel: remainingLabel(toss.expiresAtIso, now.getTime()),
  };
}

/** 受け取り口。同意していない道具からは受けない */
export class TossInbox {
  private readonly items = new Map<string, Toss>();
  private readonly decisions = new Map<string, TossDecision>();

  constructor(private readonly isChannelGranted: (c: TossChannel) => boolean) {}

  /**
   * トスを受ける。
   * その道具の同意が無ければ **受け取らずに捨てる**（勝手に鳴らさない）。
   */
  receive(channel: TossChannel, toss: Toss): { accepted: boolean; reason?: string } {
    if (!this.isChannelGranted(channel)) {
      return { accepted: false, reason: `${channel} は接続していません（既定はオフ）` };
    }
    if (this.items.has(toss.tossId)) {
      return { accepted: false, reason: "同じトスを二重に受けない" };
    }
    this.items.set(toss.tossId, toss);
    return { accepted: true };
  }

  /** 未決のトス（期限切れを除く） */
  pending(now = new Date()): TossView[] {
    const nowMs = now.getTime();
    return [...this.items.values()]
      .filter((t) => !this.decisions.has(t.tossId))
      .filter((t) => !t.expiresAtIso || Date.parse(t.expiresAtIso) > nowMs)
      .sort((a, b) => Date.parse(a.arrivedAtIso) - Date.parse(b.arrivedAtIso))
      .map((t) => toTossView(t, now));
  }

  /** 受ける／断る。断ったことも記録する（次の配り方に効く） */
  decide(tossId: string, decision: Exclude<TossDecision, "expired">): boolean {
    if (!this.items.has(tossId)) return false;
    if (this.decisions.has(tossId)) return false;
    this.decisions.set(tossId, decision);
    return true;
  }

  decisionOf(tossId: string): TossDecision | undefined {
    return this.decisions.get(tossId);
  }

  /** 画面に出す1行 */
  statusLine(now = new Date()): string {
    const n = this.pending(now).length;
    if (n === 0) return "いま届いている仕事はありません";
    return `${n} 件の仕事が届いています`;
  }
}
