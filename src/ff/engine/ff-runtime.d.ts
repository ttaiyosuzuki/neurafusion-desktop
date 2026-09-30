// src/ff/engine/ff-runtime.js（engine/ff のバンドル）の型。形は engine/ff/runtime-entry.ts。
import type { FfEvent, FfFrame, FfIndexLike, FfMove, FfState, FfTarget, FfToken } from "./contract.js";

export type FfCursor = { depth: number; branch: number };
export declare function foresee(
  state: FfState,
  index: FfIndexLike,
  opts: { k: 3 | 4 | 5; depth: number; branch: number },
): AsyncGenerator<FfFrame>;
export declare function nextPress(state: FfState, index: FfIndexLike, cur: FfCursor, k: 3 | 4 | 5): FfCursor | null;
export declare function toInstruction(path: FfMove[], target: FfTarget): string;
export declare function branchCount(state: FfState, index: FfIndexLike): number;
export declare function labelOf(token: FfToken): string;
export declare function stateKeys(recent: readonly FfToken[]): string[];
export declare function normalizeEvent(raw: unknown): FfEvent | null;
export declare function eventToJsonl(e: FfEvent): string;
export declare const FF_EMPTY_INDEX: FfIndexLike;
export declare const FF_KEYS: unknown;
