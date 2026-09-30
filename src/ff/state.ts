// FF「先読み」— 押した瞬間の「今の作業の状態」（FF-02）。端末内だけで読む。
//
// 読むのは、端末内で正規化済みのトークンの記録（~/.neurafusion/ff/state.jsonl）の末尾だけ。
// 1行 = {"k":"recent"|"edit"|"reject"|"error"|"probe","t":"<declang の正規トークン>"}。
// 生の本文・件名・相手の識別子は、この記録に入らない形でしか受けない（トークンの形を検査し、外れた行は捨てる）。
// ここで作る FfState はエンジンに渡すだけで、端末の外には出さない（記録に残すのは state の patternId＝ハッシュだけ）。

import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";
import type { FfState, FfToken } from "./engine/contract.js";
import { ffStateDir } from "./engine.js";

export const FF_STATE_TAIL_BYTES = 64 * 1024;
export const FF_RECENT_MAX = 32;

const STRUCT = new Set(["<session>", "<intent_shift>"]);
const ACTIONS = new Set(["probe", "reject", "choose", "edit", "artifact"]);
const TOOL_CLASSES = new Set(["chat", "gen", "edit", "code", "file"]);
const NOVELTY = new Set(["low", "mid", "high", "jump"]);

/**
 * declang の正規トークンか（engine/declang/tokens.ts の tokenString の形:
 * action|verb_cat|slot|field|tool_class|novelty_bkt、または <session> / <intent_shift>）。
 * 本文らしい物（長い・メール・URL・長い数字の並び・改行）は通さない。
 */
export function isNormalizedToken(t: unknown): t is FfToken {
  if (typeof t !== "string") return false;
  if (STRUCT.has(t)) return true;
  if (t.length > 160 || /[\r\n\t]/.test(t)) return false;
  if (/@|https?:|www\.|\d{7,}|\d{2,4}-\d{2,4}-\d{3,4}/i.test(t)) return false;
  const parts = t.split("|");
  if (parts.length !== 6) return false;
  const [action, verb, slot, field, tool, novelty] = parts as [string, string, string, string, string, string];
  if (!ACTIONS.has(action) || !TOOL_CLASSES.has(tool) || !NOVELTY.has(novelty)) return false;
  return [verb, slot, field].every((p) => p.length > 0 && p.length <= 40);
}

export function emptyState(): FfState {
  return { recent_tokens: [], last_edit: null, rejected: [], errors: [], probes: [] };
}

export function isEmptyState(s: FfState): boolean {
  return (
    s.recent_tokens.length === 0 && s.last_edit === null && s.rejected.length === 0 && s.errors.length === 0 && s.probes.length === 0
  );
}

/** 記録の行（新しい順でなく、書かれた順）→ FfState。形の合わない行は捨てる。 */
export function stateFromLines(lines: readonly string[]): { state: FfState; dropped: number } {
  const s = emptyState();
  let dropped = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    let obj: { k?: unknown; t?: unknown };
    try {
      obj = JSON.parse(t) as { k?: unknown; t?: unknown };
    } catch {
      dropped++;
      continue;
    }
    if (!isNormalizedToken(obj.t)) {
      dropped++;
      continue;
    }
    switch (obj.k) {
      case "recent":
        s.recent_tokens.push(obj.t);
        break;
      case "edit":
        s.recent_tokens.push(obj.t);
        s.last_edit = obj.t;
        break;
      case "reject":
        s.rejected.push(obj.t);
        break;
      case "error":
        s.errors.push(obj.t);
        break;
      case "probe":
        s.probes.push(obj.t);
        break;
      default:
        dropped++;
    }
  }
  s.recent_tokens = s.recent_tokens.slice(-FF_RECENT_MAX);
  s.rejected = s.rejected.slice(-FF_RECENT_MAX);
  s.errors = s.errors.slice(-FF_RECENT_MAX);
  s.probes = s.probes.slice(-FF_RECENT_MAX);
  return { state: s, dropped };
}

/** 押した瞬間に末尾だけ読む（常時の監視はしない）。無ければ空の状態。 */
export async function readCurrentState(dir = ffStateDir()): Promise<{ state: FfState; dropped: number; found: boolean }> {
  const p = path.join(dir, "state.jsonl");
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fh = await open(p, "r");
    const { size } = await fh.stat();
    const start = Math.max(0, size - FF_STATE_TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    const lines = buf.toString("utf8").split("\n");
    if (start > 0) lines.shift(); // 途中から読んだ最初の行は欠けている
    return { ...stateFromLines(lines), found: true };
  } catch {
    return { state: emptyState(), dropped: 0, found: false };
  } finally {
    await fh?.close();
  }
}

/** 状態の patternId（正規トークン列のハッシュ。記録に残すのはこれだけ）。 */
export function statePattern(s: FfState): string {
  const h = createHash("sha256");
  h.update(JSON.stringify([s.recent_tokens, s.last_edit, s.rejected, s.errors, s.probes]));
  return `sp:${h.digest("hex").slice(0, 16)}`;
}
