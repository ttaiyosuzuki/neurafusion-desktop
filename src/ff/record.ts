// FF「先読み」— 記録（FF-05）。何手目を採用したか・どこで止めたかを端末内に残す。
// 形は engine/ff の FfEvent（正規トークン・位置・支持数・状態の patternId・時刻だけ）。教師への変換は engine/ff/events.ts。
// 置き場: ~/.neurafusion/ff/events.jsonl（端末内。外に出すときも patternId と集計数値だけ）。

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { FfEvent, FfMove } from "./engine/contract.js";
import { ffStateDir } from "./engine.js";

export function movesForEvent(moves: readonly FfMove[]): FfEvent["moves"] {
  return moves.map((m) => ({ step: m.step, token: m.token, branch: m.branch, depth: m.depth, support_n: m.support_n }));
}

/** 記録に書く1行。FfEvent の項目だけを拾う（手の label や trace_refs は書かない）。 */
export function eventLine(e: FfEvent): string {
  const out: FfEvent = {
    kind: e.kind,
    at: e.at,
    session: e.session,
    moves: movesForEvent(e.moves as FfMove[]),
    state_pattern: e.state_pattern,
    ...(typeof e.upto_step === "number" ? { upto_step: e.upto_step } : {}),
  };
  return `${JSON.stringify(out)}\n`;
}

export type FfRecorder = (e: FfEvent) => Promise<void>;

export function fileRecorder(dir = ffStateDir()): FfRecorder {
  return async (e) => {
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "events.jsonl"), eventLine(e), "utf8");
  };
}
