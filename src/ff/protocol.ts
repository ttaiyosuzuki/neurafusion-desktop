// FF「先読み」— Node ⇄ ネイティブの行（docs/overlay-protocol.md「FF 先読み」）。
// 丸と同じ標準入出力・1行に JSON 1つ・v:1。知らない type は読み飛ばす（丸の側の実装はそのまま動く）。
//
// Node → ネイティブ: ff-config（全体キー）／ff-line（半透明の1行）／ff-hide（閉じる）
// ネイティブ → Node: ff-key（キーを受けた）／ff-drawn（その押下の最初の行を描いた・キーからの ms）／ff-keys（登録の成否）
//
// 行の text はエンジンの label（正規トークンから決定的に作った短い表示）と支持数だけ。生の本文は載せない。

import type { FfAction, FfChord, FfKeyScope } from "./keys.js";

export type FfConfigMessage = {
  v: 1;
  type: "ff-config";
  enabled: boolean;
  keys: Record<FfAction, FfChord>;
  /** global＝いつでも登録／overlay-only＝行が出ている間だけ登録（adopt・close） */
  scopes: Record<FfAction, FfKeyScope>;
  /** 画面に出す表記（設定画面・ヘルプと同じ語） */
  labels: Record<FfAction, string>;
  /** 行の不透明度（0.3〜0.95） */
  opacity: number;
};

export type FfLineKind = "move" | "none" | "info";

export type FfLineMessage = {
  v: 1;
  type: "ff-line";
  /** ネイティブが振った押下の番号（ff-key の press）。どの押下に答えた行か */
  press: number;
  /** この押下の中で何行目か（0 始まり） */
  seq: number;
  kind: FfLineKind;
  text: string;
  /** 支持数（move のときだけ） */
  n?: number;
  /** true なら前の行を消してから出す（別の枝） */
  reset?: boolean;
};

export type FfHideMessage = { v: 1; type: "ff-hide" };

export type FfInbound = FfConfigMessage | FfLineMessage | FfHideMessage;

export type FfNativeMessage =
  | { v: number; type: "ff-key"; action: FfAction; press: number }
  | { v: number; type: "ff-drawn"; press: number; seq: number; ms: number }
  | { v: number; type: "ff-keys"; ok: boolean; failed: FfAction[] };

const FF_NATIVE_TYPES = new Set(["ff-key", "ff-drawn", "ff-keys"]);
const ACTIONS = new Set(["trigger", "adopt", "close"]);

export function isFfNativeType(type: string): boolean {
  return FF_NATIVE_TYPES.has(type);
}

/** ネイティブからの ff-* の1行を読む。形が合わなければ null。 */
export function parseFfNative(obj: unknown): FfNativeMessage | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  switch (o.type) {
    case "ff-key":
      if (typeof o.action !== "string" || !ACTIONS.has(o.action)) return null;
      if (typeof o.press !== "number" || !Number.isFinite(o.press)) return null;
      return { v: Number(o.v ?? 1), type: "ff-key", action: o.action as FfAction, press: o.press };
    case "ff-drawn":
      if (typeof o.press !== "number" || typeof o.seq !== "number" || typeof o.ms !== "number") return null;
      if (!Number.isFinite(o.ms) || o.ms < 0) return null;
      return { v: Number(o.v ?? 1), type: "ff-drawn", press: o.press, seq: o.seq, ms: o.ms };
    case "ff-keys": {
      const failed = Array.isArray(o.failed) ? o.failed.filter((x): x is FfAction => typeof x === "string" && ACTIONS.has(x)) : [];
      return { v: Number(o.v ?? 1), type: "ff-keys", ok: o.ok === true, failed };
    }
    default:
      return null;
  }
}

export function encodeFf(msg: FfInbound): string {
  return `${JSON.stringify(msg)}\n`;
}

/** 行の text の上限（ネイティブの1行に収める。label はエンジン側で短い） */
export const FF_LINE_MAX_CHARS = 80;

export function clampLineText(s: string): string {
  const flat = s.replace(/[\r\n\t]+/g, " ").trim();
  return flat.length > FF_LINE_MAX_CHARS ? `${flat.slice(0, FF_LINE_MAX_CHARS - 1)}…` : flat;
}

/** 1行（JSON 文字列）から ff-* を読む。丸の行・壊れた行は null。 */
export function parseFfLine(line: string): FfNativeMessage | null {
  const t = line.trim();
  if (!t.startsWith("{")) return null;
  try {
    return parseFfNative(JSON.parse(t));
  } catch {
    return null;
  }
}
