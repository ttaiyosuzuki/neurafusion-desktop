// FF「先読み」— 全体キー（FF-01）。既定は engine/ff/keys.json（3面で同じ）。本人が変えた分は設定に保存する。
// ネイティブ（Mac・Windows・Linux）には正規形 { mods, key } で渡し、各 OS のキーコードへはネイティブ側で直す。
//
// 決まり（engine/ff/keys.json v2）:
//  - 起動（trigger＝もう一度押す も同じキー）だけが全体キー。
//  - 「これで行く」（adopt）と閉じる（close）は行が出ている間だけ登録する（他のアプリからキーを奪わない）。
//    Alt+Shift+. は VS Code / Cursor の Auto Fix（Windows・Linux）なので、全体では取らない。
//  - trigger と adopt は Ctrl / Alt / Meta（⌘・Win・Super）のどれかを必ず含む。
//  - ⌘+P / Ctrl+P（印刷など）は使わない。既存の NF のキー（Alt+Shift+N・Ctrl/⌘+Shift+9）とも重ねない。

import type { FfKeyBinding } from "./engine/contract.js";

export type FfAction = keyof FfKeyBinding; // "trigger" | "adopt" | "close"
export type FfMod = "ctrl" | "alt" | "shift" | "meta";
export type FfPlatform = "macos" | "windows" | "linux";

/** ネイティブに渡す正規形。key は1文字（小文字）か名前（"escape"・"f1" など）。 */
export type FfChord = { mods: FfMod[]; key: string };

/** engine/ff/keys.json v2（opus/ff-engine fe4d5588）の既定。src の .json は dist に運ばれないので TS 定数で持つ。 */
export const FF_DEFAULT_KEYS: Readonly<FfKeyBinding> = Object.freeze({
  trigger: "Alt+Shift+,",
  adopt: "Alt+Shift+.",
  close: "Escape",
});

/** 登録の範囲: global＝いつでも／overlay-only＝行が出ている間だけ */
export type FfKeyScope = "global" | "overlay-only";
export const FF_KEY_SCOPES: Readonly<Record<FfAction, FfKeyScope>> = Object.freeze({
  trigger: "global",
  adopt: "overlay-only",
  close: "overlay-only",
});

/** 既存の NF のキー（重ねない）と、使わないキー。 */
export const FF_EXISTING_NF_KEYS = ["Alt+Shift+N", "Ctrl+Shift+9", "Meta+Shift+9"] as const;
export const FF_FORBIDDEN_KEYS = ["Meta+P", "Ctrl+P"] as const;

const MOD_ORDER: FfMod[] = ["ctrl", "alt", "shift", "meta"];
const MOD_ALIASES: Record<string, FfMod> = {
  ctrl: "ctrl",
  control: "ctrl",
  macctrl: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  "⌥": "alt",
  shift: "shift",
  "⇧": "shift",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  "⌘": "meta",
  super: "meta",
  win: "meta",
};
const KEY_ALIASES: Record<string, string> = {
  period: ".",
  comma: ",",
  esc: "escape",
  escape: "escape",
  space: "space",
  slash: "/",
  semicolon: ";",
  quote: "'",
  bracketleft: "[",
  bracketright: "]",
  minus: "-",
  equal: "=",
  backquote: "`",
};
/** 1文字キーとして受け付けるもの（US 配列の位置で各 OS のキーコードにする） */
const CHAR_KEYS = new Set("abcdefghijklmnopqrstuvwxyz0123456789.,/;'[]-=`".split(""));
const NAMED_KEYS = new Set(["escape", "space", ...Array.from({ length: 24 }, (_, i) => `f${i + 1}`)]);

/** "Option+Shift+." ・ "Alt+Shift+Period" ・ "⌘⇧9" などを正規形にする。読めなければ null。 */
export function parseChord(text: string): FfChord | null {
  const raw = text.trim();
  if (!raw) return null;
  // "⌘⇧9" のような記号の続き書きも "+" 区切りに直す
  const parts = raw.includes("+") && raw.length > 1 ? splitPlus(raw) : splitSymbols(raw);
  if (parts.length === 0) return null;
  const mods = new Set<FfMod>();
  let key: string | null = null;
  for (const p of parts) {
    const low = p.toLowerCase();
    const mod = MOD_ALIASES[low];
    if (mod && key === null && parts.length > 1 && p !== parts[parts.length - 1]) {
      mods.add(mod);
      continue;
    }
    if (key !== null) return null; // キーは最後の1つだけ
    const k = KEY_ALIASES[low] ?? low;
    if (!(CHAR_KEYS.has(k) || NAMED_KEYS.has(k))) return null;
    key = k;
  }
  if (key === null) return null;
  return { mods: MOD_ORDER.filter((m) => mods.has(m)), key };
}

function splitPlus(s: string): string[] {
  // 末尾の "+" そのものはキーとしては受けない（US 配列では Shift+= なので "=" と書く）
  const out = s.split("+").map((x) => x.trim());
  return out.some((x) => x === "") ? [] : out;
}

function splitSymbols(s: string): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > 1 && "⌘⌥⇧⌃".includes(rest[0]!)) {
    out.push(rest[0] === "⌃" ? "ctrl" : rest[0]!);
    rest = rest.slice(1);
  }
  out.push(rest);
  return out;
}

/** 正規形の文字列（比較・保存に使う）。例: "Alt+Shift+." */
export function chordToString(c: FfChord): string {
  const names: Record<FfMod, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta" };
  const key = c.key.length === 1 ? c.key.toUpperCase() : c.key[0]!.toUpperCase() + c.key.slice(1);
  return [...c.mods.map((m) => names[m]), key].join("+");
}

/** 画面に出す表記（Mac は ⌥⇧. 風ではなく、設定画面と同じ語で出す）。 */
export function chordLabel(c: FfChord, platform: FfPlatform): string {
  const mac: Record<FfMod, string> = { ctrl: "Control", alt: "Option", shift: "Shift", meta: "Command" };
  const pc: Record<FfMod, string> = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: platform === "windows" ? "Win" : "Super" };
  const names = platform === "macos" ? mac : pc;
  const key = c.key.length === 1 ? c.key.toUpperCase() : c.key[0]!.toUpperCase() + c.key.slice(1);
  return [...c.mods.map((m) => names[m]), key].join("+");
}

function sameChord(a: FfChord, b: FfChord): boolean {
  return a.key === b.key && a.mods.length === b.mods.length && a.mods.every((m, i) => b.mods[i] === m);
}

export type FfKeyProblem =
  | { action: FfAction; code: "unparsable"; text: string }
  | { action: FfAction; code: "needs-modifier" }
  | { action: FfAction; code: "forbidden"; with: string }
  | { action: FfAction; code: "existing-nf-key"; with: string }
  | { action: FfAction; code: "duplicate"; with: FfAction };

/** キーの組を検査する。問題が無ければ空。 */
export function validateBinding(b: FfKeyBinding): FfKeyProblem[] {
  const problems: FfKeyProblem[] = [];
  const parsed: Partial<Record<FfAction, FfChord>> = {};
  for (const action of ["trigger", "adopt", "close"] as const) {
    const c = parseChord(b[action]);
    if (!c) {
      problems.push({ action, code: "unparsable", text: b[action] });
      continue;
    }
    parsed[action] = c;
    if (action === "close") continue; // 表示中だけ効くので Esc 単独でよい
    if (!c.mods.some((m) => m === "ctrl" || m === "alt" || m === "meta")) {
      problems.push({ action, code: "needs-modifier" });
    }
    for (const f of FF_FORBIDDEN_KEYS) {
      if (sameChord(c, parseChord(f)!)) problems.push({ action, code: "forbidden", with: f });
    }
    for (const e of FF_EXISTING_NF_KEYS) {
      if (sameChord(c, parseChord(e)!)) problems.push({ action, code: "existing-nf-key", with: e });
    }
  }
  const pairs: Array<[FfAction, FfAction]> = [
    ["trigger", "adopt"],
    ["trigger", "close"],
    ["adopt", "close"],
  ];
  for (const [x, y] of pairs) {
    const a = parsed[x];
    const c = parsed[y];
    if (a && c && sameChord(a, c)) problems.push({ action: y, code: "duplicate", with: x });
  }
  return problems;
}

/** 本人の設定（一部だけでもよい）と既定を合わせる。壊れた・問題のある組は既定に戻す。 */
export function resolveBinding(user: Partial<FfKeyBinding> | undefined): {
  binding: FfKeyBinding;
  problems: FfKeyProblem[];
} {
  const merged: FfKeyBinding = { ...FF_DEFAULT_KEYS, ...pickStrings(user) };
  const problems = validateBinding(merged);
  if (problems.length === 0) return { binding: merged, problems };
  return { binding: { ...FF_DEFAULT_KEYS }, problems };
}

function pickStrings(u: Partial<FfKeyBinding> | undefined): Partial<FfKeyBinding> {
  const out: Partial<FfKeyBinding> = {};
  if (!u || typeof u !== "object") return out;
  for (const k of ["trigger", "adopt", "close"] as const) {
    if (typeof u[k] === "string" && u[k]!.trim()) out[k] = u[k]!.trim();
  }
  return out;
}

/** ネイティブに渡す形（3キーとも正規形。close は scope を付けて「表示中だけ」と伝える）。 */
export function bindingToChords(b: FfKeyBinding): Record<FfAction, FfChord> {
  const t = parseChord(b.trigger);
  const a = parseChord(b.adopt);
  const c = parseChord(b.close);
  if (!t || !a || !c) throw new Error("キーの組が読めません（resolveBinding を通してください）");
  return { trigger: t, adopt: a, close: c };
}
