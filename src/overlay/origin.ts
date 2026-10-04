// NF 右下の丸 — 読んだ要素の出どころ（origin）を決める規則（FY-16 (4)・FX-31／FX-34 の取り先・常駐アプリの側）。
//
// 決めるのはここ 1 か所。各 OS のネイティブ側（Mac の AX・Windows の UIA・Linux の AT-SPI）は、窓の要素の木を
// 役割・識別子・クラスなどの手がかりと文のまま写して渡すだけ（AxSnapNode）。出どころは付けない。
//
// 決め方（拡張の extension-kensan/supply.js と同じ考え）:
//   - AI のチャットの窓で、アプリごとの手がかり（ORIGIN_HINTS）に合う「本人が送った発話」の要素の中の文 ＝ self_input、
//     「AI の返事」の要素の中の文 ＝ ai_output。engine/passive/config.ts の READ_ORIGINS と同じ 2 つだけ。
//   - それ以外は渡さない（出どころを付けない＝事件に入れない。数だけ not_read に数える）:
//       ・手がかりの無いアプリ・発話と返事の片方しか手がかりが無いアプリ・実機で確かめていない手がかり（verified: false）
//       ・共有の会話（他人の会話）の印がある窓（窓全体を読まない）
//       ・発話と返事の両方の中にある要素（入れ子＝決められない）
//       ・発話・返事の中でも、入力欄（入力中の下書き）・リンク・引用・画像・入れ子の文書（iframe など）・
//         出典／添付の印（識別子・クラスに citation・source・attachment・file・quote）の中の文（取ってきたページ・他人の文の恐れ）
//       ・発話・返事の外の文（横の会話の一覧・サイトの飾り・他人の投稿）
//   - 要素の id は位置だけ（何番目の発話・何番目の段落）。文から作らない。
//
// 渡すもの（engine の入口の形・src/overlay/engine/supply-contract.ts の写し）:
//   - FX-31 UiEvent の exposed（items: item_id・kind・origin。文は入れない）
//   - FX-34 HoverEvent の enter／leave／tick（element: element_id・kind・origin・raw_text・context）
//     raw_text は端末内の埋め込みの入力（engine は状態に写さない）。受け手は同じプロセスの中で subscribe した関数だけ。

import type { OverlayPlatform } from "./apps.js";
import {
  HOVER_CONTEXT_WINDOW,
  READ_ORIGINS,
  type ExposedItem,
  type HoverElement,
  type HoverEvent,
  type ReadOrigin,
  type UiEvent,
} from "./engine/supply-contract.js";

export type { ReadOrigin } from "./engine/supply-contract.js";

/** ネイティブが写す要素の木の 1 つ（出どころは付けない。手がかりと文だけ） */
export type AxSnapNode = {
  /** Mac: AXRole（AXStaticText など）・Windows: ControlType の名前（Text など）・Linux: AT-SPI の役割の名前（static など） */
  role: string;
  /** Mac: AXSubrole */
  subrole?: string;
  /** Mac: AXIdentifier／AXDOMIdentifier・Windows: AutomationId・Linux: AT-SPI の属性 id */
  id?: string;
  /** Mac: AXDOMClassList・Windows: ClassName を空白で分けた物・Linux: AT-SPI の属性 class を空白で分けた物 */
  classes?: readonly string[];
  /** 書き込める要素（入力欄・contenteditable）。入力中の下書きは読まない */
  editable?: boolean;
  /** 見えている文（Mac: AXValue／AXTitle／AXDescription・Windows: Name／TextPattern・Linux: Text） */
  text?: string;
  children?: readonly AxSnapNode[];
};

/** 手がかり 1 つ（書いた条件をすべて満たす要素に合う） */
export type NodeMatcher = { role?: string; subrole?: string; id?: string; idPrefix?: string; class?: string };

export type AppOriginHints = {
  /** apps.ts の id */
  app: string;
  platform: OverlayPlatform;
  /** 本人が送った発話の要素 */
  user: readonly NodeMatcher[];
  /** AI の返事の要素 */
  ai: readonly NodeMatcher[];
  /** 共有の会話（他人の会話）の窓の印。どこかに合えば窓全体を読まない */
  shared?: readonly NodeMatcher[];
  /** 実機の窓で確かめた手がかりか。false の物は使わない（推測で読まない） */
  verified: boolean;
  /** 手がかりの出どころ（apps.ts と同じく、確かめた日・機械・版を書く） */
  source: string;
};

/**
 * アプリごとの手がかり。apps.ts と同じく **実機で確かめた値だけ** を verified: true で書く。
 * 2026-10-04 時点、どのアプリの AX／UIA／AT-SPI の木も確かめていない＝本番では何も読まない（安全側）。
 * 拡張の adapters.js の手がかり（data-testid・data-message-author-role など）は DOM の属性で、AX には出ないので写せない。
 */
export const ORIGIN_HINTS: readonly AppOriginHints[] = [
  {
    app: "claude",
    platform: "macos",
    user: [],
    ai: [],
    verified: false,
    source:
      "未実測。Claude.app は claude.ai と同じ画面だが、拡張の手がかり（[data-testid=\"user-message\"]・[data-is-streaming]）は AX に出ない。実機で AXDOMClassList／AXDOMIdentifier を読んで足す",
  },
  {
    app: "chatgpt",
    platform: "macos",
    user: [],
    ai: [],
    verified: false,
    source: "未実測。この Mac の ChatGPT.app（com.openai.codex 26.901.51231）の発話・返事の AX の形は確かめていない",
  },
  {
    app: "cursor",
    platform: "macos",
    user: [],
    ai: [],
    verified: false,
    source: "未実測。チャットの欄の AX の形は確かめていない（編集中のファイルは発話ではないので、手がかりを足すときもチャットの欄だけ）",
  },
  // notion: チャットの窓ではない（他人の書いた頁・共有の頁がある）ので手がかりを置かない＝読まない
];

// 役割の名前（3 つの OS の書き方をまとめて持つ。比較は大文字小文字そのまま）
const LINK_ROLES = new Set(["AXLink", "Hyperlink", "link"]);
const INPUT_ROLES = new Set(["AXTextArea", "AXTextField", "AXSearchField", "AXComboBox", "Edit", "ComboBox", "entry", "password text", "combo box", "editbar", "terminal"]);
const IMAGE_ROLES = new Set(["AXImage", "Image", "image", "icon"]);
const FRAME_ROLES = new Set(["AXWebArea", "Document", "document web", "document frame", "embedded", "internal frame"]);
const QUOTE_ROLES = new Set(["block quote", "blockquote"]);
const HEADING_ROLES = new Set(["AXHeading", "heading"]);
const LIST_ITEM_ROLES = new Set(["AXListItem", "ListItem", "list item"]);
// 出典・添付・引用の印（拡張の NOT_OURS と同じ語）
const NOT_OURS_HINT = /citation|source|attachment|file|quote/i;
const CODE_HINT = /(^|[-_\s])(code|hljs|language-[\w-]+|pre)($|[-_\s])/i;

const MAX_TEXT = 2000; // raw_text の上限（拡張と同じ。端末内の埋め込みに足りる長さ）
const MAX_DEPTH = 80; // ネイティブの読み取りと同じ上限
const MAX_NODES = 20000;

export type SuppliedElement = {
  element_id: string;
  kind: "paragraph" | "heading" | "list_item" | "code_block";
  origin: ReadOrigin;
  raw_text: string;
  /** 段落の親の要素の位置（木の中の子の番号の列）。ホバーの位置合わせ用 */
  parent: readonly number[];
  /** 段落に入れた文の要素の位置 */
  leaves: number[][];
};

export type WholeDrop = "no-hints" | "unverified" | "shared";

export type OriginResult = {
  elements: SuppliedElement[];
  /** 渡さなかった文の要素の数（文・id・種別は残さない） */
  not_read: number;
  /** 窓全体を読まなかった理由 */
  whole?: WholeDrop;
  /** 読まない部分木（リンク・入力欄など）の位置。ホバーがそこに乗ったら渡さない */
  excluded: readonly (readonly number[])[];
};

export type ClassifyOptions = {
  app: string;
  platform: OverlayPlatform;
  hints?: readonly AppOriginHints[];
  /** 確かめていない手がかりも使う（合成の見本のテストだけ） */
  allowUnverified?: boolean;
};

function matches(n: AxSnapNode, m: NodeMatcher): boolean {
  if (m.role === undefined && m.subrole === undefined && m.id === undefined && m.idPrefix === undefined && m.class === undefined) return false;
  if (m.role !== undefined && n.role !== m.role) return false;
  if (m.subrole !== undefined && n.subrole !== m.subrole) return false;
  if (m.id !== undefined && n.id !== m.id) return false;
  if (m.idPrefix !== undefined && !(typeof n.id === "string" && n.id.startsWith(m.idPrefix))) return false;
  if (m.class !== undefined && !(Array.isArray(n.classes) && n.classes.includes(m.class))) return false;
  return true;
}

const anyMatch = (n: AxSnapNode, ms: readonly NodeMatcher[] | undefined) => !!ms && ms.some((m) => matches(n, m));

function textOf(n: AxSnapNode): string {
  return typeof n.text === "string" ? n.text.trim() : "";
}

function isNotOurs(n: AxSnapNode): boolean {
  if (n.editable === true) return true;
  if (LINK_ROLES.has(n.role) || INPUT_ROLES.has(n.role) || IMAGE_ROLES.has(n.role) || FRAME_ROLES.has(n.role) || QUOTE_ROLES.has(n.role)) return true;
  if (typeof n.id === "string" && NOT_OURS_HINT.test(n.id)) return true;
  if (Array.isArray(n.classes) && n.classes.some((c) => typeof c === "string" && NOT_OURS_HINT.test(c))) return true;
  return false;
}

function kindOf(n: AxSnapNode): SuppliedElement["kind"] | null {
  if (HEADING_ROLES.has(n.role)) return "heading";
  if (LIST_ITEM_ROLES.has(n.role)) return "list_item";
  if (Array.isArray(n.classes) && n.classes.some((c) => typeof c === "string" && CODE_HINT.test(c))) return "code_block";
  return null;
}

/** 木を上から順に（子の順に）たどる。壊れた要素・深すぎ・多すぎは打ち切る */
function walk(root: unknown, visit: (n: AxSnapNode, path: number[], depth: number) => boolean | void): void {
  let seen = 0;
  const go = (n: unknown, path: number[], depth: number): void => {
    if (!n || typeof n !== "object" || typeof (n as AxSnapNode).role !== "string") return;
    if (depth > MAX_DEPTH || ++seen > MAX_NODES) return;
    if (visit(n as AxSnapNode, path, depth) === false) return;
    const kids = (n as AxSnapNode).children;
    if (!Array.isArray(kids)) return;
    kids.forEach((k, i) => go(k, [...path, i], depth + 1));
  };
  go(root, [], 0);
}

function countTexts(root: unknown): number {
  let c = 0;
  walk(root, (n) => {
    if (textOf(n)) c += 1;
  });
  return c;
}

/** この窓・このアプリで使ってよい手がかり（無ければ読まない理由） */
export function hintsFor(opts: ClassifyOptions): AppOriginHints | WholeDrop {
  const h = (opts.hints ?? ORIGIN_HINTS).find((x) => x.app === opts.app && x.platform === opts.platform);
  if (!h || h.user.length === 0 || h.ai.length === 0) return "no-hints";
  if (!h.verified && !opts.allowUnverified) return "unverified";
  return h;
}

/** 要素の木から、本人の発話（self_input）と AI の返事（ai_output）の中の文だけを段落ごとに取り出す。ほかは数だけ */
export function classifyTree(root: unknown, opts: ClassifyOptions): OriginResult {
  const h = hintsFor(opts);
  if (typeof h === "string") return { elements: [], not_read: countTexts(root), whole: h, excluded: [] };

  let shared = false;
  walk(root, (n) => {
    if (anyMatch(n, h.shared)) shared = true;
  });
  if (shared) return { elements: [], not_read: countTexts(root), whole: "shared", excluded: [] };

  type Ctx = { origin: ReadOrigin | null; conflict: boolean; out: boolean; kind: SuppliedElement["kind"] | null; turn: number };
  const ctxAt = new Map<string, Ctx>();
  const key = (p: readonly number[]) => p.join(".");
  const root0: Ctx = { origin: null, conflict: false, out: false, kind: null, turn: -1 };
  const elements: SuppliedElement[] = [];
  const excluded: number[][] = [];
  const blocksInTurn = new Map<number, number>();
  let notRead = 0;
  let turns = 0;
  // 同じ親・同じ発話の続きの文の葉は 1 つの段落にまとめる
  let open: { parentKey: string; turn: number; texts: string[]; el: SuppliedElement } | null = null;
  const flush = () => {
    if (open) {
      open.el.raw_text = open.texts.join(" ").slice(0, MAX_TEXT);
      elements.push(open.el);
      open = null;
    }
  };

  walk(root, (n, path) => {
    const parentPath = path.slice(0, -1);
    const up = path.length === 0 ? root0 : (ctxAt.get(key(parentPath)) ?? root0);
    const ctx: Ctx = { ...up };
    const isUser = anyMatch(n, h.user);
    const isAi = anyMatch(n, h.ai);
    if (isUser || isAi) {
      const mine: ReadOrigin = isUser && !isAi ? "self_input" : "ai_output";
      if ((isUser && isAi) || (ctx.origin !== null && ctx.origin !== mine)) ctx.conflict = true;
      if (ctx.origin === null) {
        ctx.origin = mine;
        ctx.turn = turns++;
        ctx.kind = null;
      }
    }
    if (ctx.origin !== null && !ctx.out && !ctx.conflict && isNotOurs(n)) {
      ctx.out = true;
      excluded.push(path);
    }
    if (ctx.origin !== null) ctx.kind = kindOf(n) ?? ctx.kind;
    ctxAt.set(key(path), ctx);

    const t = textOf(n);
    if (!t) return;
    if (ctx.origin === null || ctx.conflict || ctx.out) {
      notRead += 1;
      return;
    }
    const pk = key(parentPath);
    if (open && open.parentKey === pk && open.turn === ctx.turn) {
      open.texts.push(t);
      open.el.leaves.push(path);
      return;
    }
    flush();
    const b = blocksInTurn.get(ctx.turn) ?? 0;
    blocksInTurn.set(ctx.turn, b + 1);
    open = {
      parentKey: pk,
      turn: ctx.turn,
      texts: [t],
      el: { element_id: `${opts.app}:t${ctx.turn}:b${b}`, kind: ctx.kind ?? "paragraph", origin: ctx.origin, raw_text: "", parent: parentPath, leaves: [path] },
    };
  });
  flush();
  // 衝突（入れ子）した発話の中の文も数に入っている。渡す要素は READ_ORIGINS の物だけ（念のため）
  const kept = elements.filter((e) => (READ_ORIGINS as readonly string[]).includes(e.origin));
  return { elements: kept, not_read: notRead + (elements.length - kept.length), excluded };
}

const startsWith = (p: readonly number[], prefix: readonly number[]) => prefix.length <= p.length && prefix.every((v, i) => p[i] === v);

/** カーソルの下の要素の位置から、渡してよい段落を探す（読まない部分木の中・決められないときは null） */
export function elementAt(res: OriginResult, at: readonly number[] | null | undefined): SuppliedElement | null {
  if (!Array.isArray(at)) return null;
  if (res.excluded.some((x) => startsWith(at, x))) return null;
  // 文の要素そのもの（またはその中）に乗っている
  const byLeaf = res.elements.find((e) => e.leaves.some((l) => startsWith(at, l)));
  if (byLeaf) return byLeaf;
  // 段落の親に乗っている: その親の段落が 1 つだけのときだけ
  const byParent = res.elements.filter((e) => startsWith(at, e.parent) && at.length === e.parent.length);
  return byParent.length === 1 ? byParent[0]! : null;
}

/** FX-31 の exposed（文は入れない）。渡す要素が無ければ null */
export function exposedEvent(res: OriginResult, ts: string): UiEvent | null {
  if (res.elements.length === 0) return null;
  const items: ExposedItem[] = res.elements.map((e) => ({ item_id: e.element_id, kind: e.kind, origin: e.origin }));
  return { type: "exposed", ts, items };
}

/** FX-34 の enter（前後の文脈つき）。読まない要素に乗っているなら leave */
export function hoverEvent(res: OriginResult, at: readonly number[] | null | undefined, ts: number): HoverEvent {
  const e = elementAt(res, at);
  if (!e) return { type: "leave", ts };
  const i = res.elements.indexOf(e);
  const context = [
    ...res.elements.slice(Math.max(0, i - HOVER_CONTEXT_WINDOW), i),
    ...res.elements.slice(i + 1, i + 1 + HOVER_CONTEXT_WINDOW),
  ].map((c) => ({ kind: c.kind, origin: c.origin, raw_text: c.raw_text }));
  const element: HoverElement = { element_id: e.element_id, kind: e.kind, origin: e.origin, raw_text: e.raw_text, context };
  return { type: "enter", ts, element };
}
