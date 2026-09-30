// FF「先読み」— エンジン（engine/ff のバンドル）と索引の入口。
//
// 手を選ぶのはエンジンだけ。デスクトップは表を引いた結果を出すだけで、手を作らない。
// 索引は「実在の記録」（取り込み台帳で本物と記録され、FF が読み手として許された出どころ）から作った物だけを使う。
//  - 読む場所: ~/.neurafusion/ff/index.json（エンジンが作って端末に置く。識別子なし）
//  - mode が "production" でない物・出どころに real 以外がある物は読まない（テスト用の索引を本番の面で使わない）
//  - 無ければ空の本番索引＝キーを押しても手は出ない（「記録なし」を1行だけ出す）

import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FfFrame, FfIndexLike, FfMove, FfState, FfTarget } from "./engine/contract.js";

export type FfCursor = { depth: number; branch: number };

/** デスクトップが使うエンジンの口（engine/ff の foresee.ts と同じ名前・同じ形）。 */
export type FfEngine = {
  foresee: (state: FfState, index: FfIndexLike, opts: { k: 3 | 4 | 5; depth: number; branch: number }) => AsyncGenerator<FfFrame>;
  nextPress: (state: FfState, index: FfIndexLike, cur: FfCursor, k: 3 | 4 | 5) => FfCursor | null;
  toInstruction: (path: FfMove[], target: FfTarget) => string;
};

/** 本番の索引の置き場の形（engine/ff/index.ts の FfIndex のうち、ここで確かめる所だけ）。 */
type ProductionIndexShape = FfIndexLike & {
  mode?: unknown;
  sources?: unknown;
  table?: unknown;
};

export function ffStateDir(home = os.homedir()): string {
  return path.join(home, ".neurafusion", "ff");
}

export function emptyProductionIndex(): FfIndexLike & { mode: "production"; sources: []; table: Record<string, never> } {
  return { kind: "ff-index", version: 1, mode: "production", sources: [], table: {} };
}

export type IndexCheck = { ok: true } | { ok: false; reason: "missing" | "malformed" | "not-production" | "not-real-source" };

/** 本番の面で読んでよい索引か。 */
export function checkProductionIndex(raw: unknown): IndexCheck {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "malformed" };
  const r = raw as ProductionIndexShape;
  if (r.kind !== "ff-index" || typeof r.version !== "number") return { ok: false, reason: "malformed" };
  if (!r.table || typeof r.table !== "object") return { ok: false, reason: "malformed" };
  if (r.mode !== "production") return { ok: false, reason: "not-production" };
  if (!Array.isArray(r.sources)) return { ok: false, reason: "malformed" };
  for (const s of r.sources) {
    if (!s || typeof s !== "object" || (s as { provenance?: unknown }).provenance !== "real") {
      return { ok: false, reason: "not-real-source" };
    }
  }
  return { ok: true };
}

/** 本番の索引を読む。読めない・条件に合わない物は空の本番索引（手は出ない）。 */
export async function loadProductionIndex(
  dir = ffStateDir(),
  readText: (p: string) => Promise<string> = (p) => readFile(p, "utf8"),
): Promise<{ index: FfIndexLike; check: IndexCheck }> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readText(path.join(dir, "index.json")));
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException)?.code === "ENOENT";
    return { index: emptyProductionIndex(), check: { ok: false, reason: missing ? "missing" : "malformed" } };
  }
  const check = checkProductionIndex(raw);
  return { index: check.ok ? (raw as FfIndexLike) : emptyProductionIndex(), check };
}

/**
 * エンジンのバンドルが入っていないときの口: 手を1つも作らない（「記録なし」だけ）。
 * 手を推測で作る実装は置かない（合成・LLM の推測を手の候補に使わない）。
 */
export const NO_RECORD_ENGINE: FfEngine = {
  async *foresee(state) {
    const empty =
      state.recent_tokens.length === 0 &&
      state.last_edit === null &&
      state.errors.length === 0 &&
      state.probes.length === 0 &&
      state.rejected.length === 0;
    yield { type: "none", reason: empty ? "no_state" : "no_record" };
  },
  nextPress: () => null,
  toInstruction: () => {
    throw new Error("FF: エンジンが無いので指示文を作れません");
  },
};

/**
 * 同梱したエンジン（src/ff/engine/ff-runtime.js＝engine/ff のバンドル）を読む。無ければ NO_RECORD_ENGINE。
 * バンドルの取り込みは scripts/nf-ff/sync-engine.sh。
 */
export async function loadEngine(
  importer: () => Promise<Partial<FfEngine>> = () => import("./engine/ff-runtime.js") as Promise<Partial<FfEngine>>,
): Promise<{ engine: FfEngine; bundled: boolean }> {
  try {
    const m = await importer();
    if (typeof m.foresee === "function" && typeof m.nextPress === "function" && typeof m.toInstruction === "function") {
      return { engine: { foresee: m.foresee, nextPress: m.nextPress, toInstruction: m.toInstruction }, bundled: true };
    }
  } catch {
    // 入っていない
  }
  return { engine: NO_RECORD_ENGINE, bundled: false };
}
