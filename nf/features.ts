/**
 * ★NF (a) 分身測定。ローカル走査 → patternId の特徴量だけを作る。
 *
 * 考え方（NF-62 能力のグラフ伝播）:
 *   すごい人と、速く・濃くやり取りしている人は、その分野ですごい。
 *   これを測るのに **中身は端末の外に要らない**。
 *   要るのは「どの型の作業を、どれくらいの密度と速さでやってきたか」だけ。
 *
 * この層の責任:
 *   端末内で読んだ生値を受け取り、**型と数値に変えて、生値を捨てる**。
 *   ここから先（payloadGuard → server）へは、生値を触れる形では渡さない。
 */

import type { ConsentChannel } from "./consent.js";
import type { OutboundPayload } from "./payloadGuard.js";

/** 端末内で読んだ1件の観測。**この型は端末の外に出さない** */
export type LocalObservation = {
  channel: ConsentChannel;
  /** 分野の手がかり（端末内で分類した結果） */
  field: string;
  /** 相手を端末内でだけ区別するための番号。**送らない** */
  localCounterpartRef: string;
  /** 返すまでにかかった時間（分） */
  responseMinutes: number;
  /** やり取りの往復数 */
  exchanges: number;
  /** いつ */
  atIso: string;
};

/** 端末内で使う道具の観測 */
export type ToolObservation = {
  /** アプリやファイル種の型（拡張子・アプリ名を端末内で型に落としたもの） */
  toolPatternId: string;
  /** その道具を使った回数 */
  uses: number;
  atIso: string;
};

const ID_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

/** 分野名を型の識別子に落とす。落とせないものは捨てる（推測で作らない） */
export function toFieldPatternId(field: string): string | null {
  const slug = field
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "");
  if (!slug || !ID_RE.test(slug)) return null;
  return `field.${slug}`.slice(0, 64);
}

/** 0〜1 に収める */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * 応答の速さを 0〜1 にする。
 * 速いほど 1 に近い。24時間（1440分）で 0 に近づく。
 */
export function responseSpeedScore(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 0) return 0;
  return clamp01(1 / (1 + minutes / 60));
}

/**
 * 濃さを 0〜1 にする。往復が多いほど濃い。20往復で頭打ち。
 */
export function densityScore(exchanges: number): number {
  if (!Number.isFinite(exchanges) || exchanges <= 0) return 0;
  return clamp01(exchanges / 20);
}

export type FeatureSummary = {
  /** 送る型の一覧 */
  patternIds: string[];
  /** 送る数値 */
  metrics: Record<string, number>;
  /** 端末内にだけ残る数（送らない。画面に出すため） */
  local: {
    observationCount: number;
    /** 相手の数。**人数だけ。誰かは出さない** */
    counterpartCount: number;
    droppedCount: number;
  };
};

/**
 * 観測から特徴量を作る。
 * ★戻り値に生値は含まれない。localCounterpartRef はここで数に変わって消える。
 */
export function summarize(
  observations: readonly LocalObservation[],
  tools: readonly ToolObservation[] = [],
): FeatureSummary {
  const patternSet = new Set<string>();
  const speedByField = new Map<string, number[]>();
  const densityByField = new Map<string, number[]>();
  const counterparts = new Set<string>();
  let dropped = 0;

  for (const o of observations) {
    const pid = toFieldPatternId(o.field);
    if (!pid) {
      /* 型に落とせない分野は捨てる。推測で型を作らない */
      dropped += 1;
      continue;
    }
    patternSet.add(pid);
    counterparts.add(o.localCounterpartRef);
    (speedByField.get(pid) ?? speedByField.set(pid, []).get(pid)!).push(responseSpeedScore(o.responseMinutes));
    (densityByField.get(pid) ?? densityByField.set(pid, []).get(pid)!).push(densityScore(o.exchanges));
  }

  for (const t of tools) {
    if (!ID_RE.test(t.toolPatternId)) {
      dropped += 1;
      continue;
    }
    patternSet.add(`tool.${t.toolPatternId}`.slice(0, 64));
  }

  const metrics: Record<string, number> = {};
  const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

  for (const [pid, xs] of speedByField) {
    metrics[`${pid}.speed`.slice(0, 64)] = clamp01(avg(xs));
  }
  for (const [pid, xs] of densityByField) {
    metrics[`${pid}.density`.slice(0, 64)] = clamp01(avg(xs));
    /* 件数は上限で割って 0〜1 に。生の件数は出さない（人数の推定につながるため） */
    metrics[`${pid}.volume`.slice(0, 64)] = clamp01(xs.length / 100);
  }

  return {
    patternIds: [...patternSet].sort(),
    metrics,
    local: {
      observationCount: observations.length,
      counterpartCount: counterparts.size,
      droppedCount: dropped,
    },
  };
}

/** 送る形に組み立てる（この後 payloadGuard を必ず通す） */
export function toOutboundPayload(
  summary: FeatureSummary,
  consentScopeId: string,
  nowIso = new Date().toISOString(),
): OutboundPayload {
  return {
    patternIds: summary.patternIds,
    metrics: summary.metrics,
    producedAtIso: nowIso,
    consentScopeId,
  };
}
