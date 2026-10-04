// FY-16 (4) 常駐アプリの取り先の供給の検査（合成の見本の要素の木だけ。実際のアプリの窓は開かない）。
// 見本の文の頭: 〔本〕本人の発話・〔AI〕AI の返事・〔他〕渡してはいけない文（第三者・サイト・下書き・出典・引用・添付）。

import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startOverlayHost } from "./host.js";
import { ORIGIN_HINTS, classifyTree, elementAt, hoverEvent, type AppOriginHints, type AxSnapNode } from "./origin.js";
import { parseNativeLine, redactForLog } from "./protocol.js";
import { DEFAULT_SETTINGS } from "./settings.js";
import { createOverlaySupply, type SupplyEvent } from "./supply.js";
import type { OverlayPlatform } from "./apps.js";

type Fixture = { platform: OverlayPlatform; method: "ax" | "uia" | "atspi"; root: AxSnapNode };
const load = (name: string): Fixture => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as Fixture;

const FIXTURES = ["supply-mac-ax", "supply-win-uia", "supply-linux-atspi"] as const;

// 合成の見本に合わせた手がかり（実機の値ではない）
const SYNTH: AppOriginHints[] = (["macos", "windows", "linux"] as const).map((platform) => ({
  app: "claude",
  platform,
  user: [{ class: "nf-synth-user-turn" }],
  ai: [{ class: "nf-synth-ai-turn" }],
  shared: [{ id: "nf-synth-shared-banner" }],
  verified: false,
  source: "合成（テストの見本だけ）",
}));

function texts(root: AxSnapNode): string[] {
  const out: string[] = [];
  const go = (n: AxSnapNode) => {
    if (typeof n.text === "string" && n.text.trim()) out.push(n.text.trim());
    n.children?.forEach(go);
  };
  go(root);
  return out;
}

/** 位置（子の番号の列）で要素を引く */
function pathOf(root: AxSnapNode, pred: (n: AxSnapNode) => boolean): number[] {
  let hit: number[] | null = null;
  const go = (n: AxSnapNode, p: number[]) => {
    if (hit) return;
    if (pred(n)) {
      hit = p;
      return;
    }
    n.children?.forEach((k, i) => go(k, [...p, i]));
  };
  go(root, []);
  if (!hit) throw new Error("見本に要素が無い");
  return hit;
}

describe("出どころの規則（合成の要素の木）", () => {
  for (const name of FIXTURES) {
    it(`${name}: 本人の発話と AI の返事だけが origin つきで取られ、〔他〕は 0 件`, () => {
      const fx = load(name);
      const res = classifyTree(fx.root, { app: "claude", platform: fx.platform, hints: SYNTH, allowUnverified: true });
      const all = texts(fx.root);
      const others = all.filter((t) => t.startsWith("〔他〕"));
      const ours = all.filter((t) => !t.startsWith("〔他〕"));

      expect(res.whole).toBeUndefined();
      // 〔他〕は 1 つも渡らない（文の一部にも入らない）
      expect(res.elements.filter((e) => e.raw_text.includes("〔他〕"))).toHaveLength(0);
      // 渡さなかった数＝〔他〕の数（本人・AI の文は 1 つも落ちていない）
      expect(res.not_read).toBe(others.length);
      for (const t of ours) expect(res.elements.some((e) => e.raw_text.includes(t))).toBe(true);
      // origin は文の出どころと一致する
      for (const e of res.elements) {
        expect(["self_input", "ai_output"]).toContain(e.origin);
        const parts = e.raw_text.split(" ");
        expect(parts.every((p) => p.startsWith(e.origin === "self_input" ? "〔本〕" : "〔AI〕") || !p.startsWith("〔"))).toBe(true);
      }
      expect(res.elements.map((e) => e.origin)).toEqual(["self_input", "ai_output", "ai_output", "ai_output", "ai_output", "self_input"]);
      // 同じ親の続きの文の葉は 1 つの段落（リンクの文は抜く）
      expect(res.elements[2]!.raw_text).toBe("〔AI〕pandas で読み込み、 〔AI〕月ごとに合計します。");
      expect(res.elements[3]!.kind).toBe("code_block");
      // id は位置だけ（文から作らない）
      for (const e of res.elements) expect(e.element_id).toMatch(/^claude:t\d+:b\d+$/);
    });
  }

  it("見出しの役割がある OS（Mac・Linux）では heading になる", () => {
    for (const name of ["supply-mac-ax", "supply-linux-atspi"] as const) {
      const fx = load(name);
      const res = classifyTree(fx.root, { app: "claude", platform: fx.platform, hints: SYNTH, allowUnverified: true });
      expect(res.elements[1]!.kind).toBe("heading");
    }
  });

  it("共有の会話の窓は何も渡さない", () => {
    const fx = load("supply-mac-ax-shared");
    const res = classifyTree(fx.root, { app: "claude", platform: "macos", hints: SYNTH, allowUnverified: true });
    expect(res.whole).toBe("shared");
    expect(res.elements).toHaveLength(0);
    expect(res.not_read).toBe(texts(fx.root).length);
  });

  it("本番の手がかり（ORIGIN_HINTS）はどのアプリも確かめていない＝何も渡さない", () => {
    const fx = load("supply-mac-ax");
    for (const app of ["claude", "chatgpt", "cursor", "notion", "perplexity"]) {
      const res = classifyTree(fx.root, { app, platform: "macos" });
      expect(res.elements).toHaveLength(0);
      expect(res.not_read).toBe(texts(fx.root).length);
    }
    expect(ORIGIN_HINTS.every((h) => !h.verified)).toBe(true);
  });

  it("確かめていない手がかりは allowUnverified なしでは使わない・片方しか無い手がかりも使わない", () => {
    const fx = load("supply-mac-ax");
    expect(classifyTree(fx.root, { app: "claude", platform: "macos", hints: SYNTH }).whole).toBe("unverified");
    const half: AppOriginHints[] = [{ ...SYNTH[0]!, ai: [], verified: true }];
    expect(classifyTree(fx.root, { app: "claude", platform: "macos", hints: half }).whole).toBe("no-hints");
    const ok: AppOriginHints[] = [{ ...SYNTH[0]!, verified: true }];
    expect(classifyTree(fx.root, { app: "claude", platform: "macos", hints: ok }).elements).toHaveLength(6);
    // 中身の無い手がかり（{}）はどの要素にも合わない
    const empty: AppOriginHints[] = [{ ...SYNTH[0]!, user: [{}], ai: [{}], verified: true }];
    expect(classifyTree(fx.root, { app: "claude", platform: "macos", hints: empty }).elements).toHaveLength(0);
  });

  it("壊れた木・深すぎる木でも落ちない", () => {
    expect(classifyTree(null, { app: "claude", platform: "macos", hints: SYNTH, allowUnverified: true }).elements).toHaveLength(0);
    let deep: AxSnapNode = { role: "AXStaticText", text: "〔本〕深い" };
    for (let i = 0; i < 200; i++) deep = { role: "AXGroup", children: [deep], ...(i === 199 ? { classes: ["nf-synth-user-turn"] } : {}) };
    expect(classifyTree(deep, { app: "claude", platform: "macos", hints: SYNTH, allowUnverified: true }).elements).toHaveLength(0);
  });
});

describe("ホバー（FX-34 の入口の形）", () => {
  const fx = load("supply-mac-ax");
  const res = classifyTree(fx.root, { app: "claude", platform: "macos", hints: SYNTH, allowUnverified: true });

  it("AI の返事の段落に乗ると enter（前後 1 つずつの文脈つき・文脈も本人・AI の物だけ）", () => {
    const at = pathOf(fx.root, (n) => n.text === "〔AI〕月ごとに合計します。");
    const h = hoverEvent(res, at, 1000);
    expect(h.type).toBe("enter");
    if (h.type !== "enter") return;
    expect(h.element.origin).toBe("ai_output");
    expect(h.element.raw_text).toContain("月ごとに合計します");
    expect(h.element.context).toHaveLength(2);
    expect(h.element.context!.every((c) => !c.raw_text?.includes("〔他〕"))).toBe(true);
  });

  it("段落の中のリンク・入力中の下書き・横の一覧・入れ子の発話・何も無い所では leave", () => {
    for (const t of ["〔他〕pandas の公式文書（取ってきたページ）", "〔他〕編集中の発話の下書き", "〔他〕最近の会話 2", "〔他〕発話と返事の入れ子の文", "〔他〕サイトの飾り: 利用規約"]) {
      const at = pathOf(fx.root, (n) => n.text === t);
      expect(hoverEvent(res, at, 1).type).toBe("leave");
    }
    expect(hoverEvent(res, null, 1).type).toBe("leave");
    // 発話の外枠（段落より大きい所）も決められない＝渡さない
    expect(elementAt(res, pathOf(fx.root, (n) => n.classes?.includes("nf-synth-ai-turn") === true))).toBeNull();
  });
});

describe("供給（受け手は同じプロセスの中だけ・外への送信 0 件）", () => {
  let netCalls = 0;
  beforeEach(() => {
    netCalls = 0;
    const count = () => {
      netCalls += 1;
      throw new Error("外への送信はしない");
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(count as never);
    vi.spyOn(http, "request").mockImplementation(count as never);
    vi.spyOn(https, "request").mockImplementation(count as never);
    vi.spyOn(net, "connect").mockImplementation(count as never);
    vi.spyOn(net.Socket.prototype, "connect").mockImplementation(count as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("受け手が居ないあいだは何もしない", () => {
    const s = createOverlaySupply({ platform: "macos", hints: SYNTH, allowUnverified: true });
    const fx = load("supply-mac-ax");
    expect(s.onElements({ v: 1, type: "elements", app: "claude", method: "ax", root: fx.root })).toEqual({ supplied: 0, not_read: 0, idle: true });
    expect(s.stats()).toEqual({ supplied: 0, not_read: 0 });
  });

  it("exposed（文なし）と hover の enter／tick／leave を渡し、〔他〕は事件のどこにも入らない", () => {
    const fx = load("supply-mac-ax");
    const s = createOverlaySupply({ platform: "macos", hints: SYNTH, allowUnverified: true, now: () => new Date("2026-10-04T06:00:00Z") });
    const got: SupplyEvent[] = [];
    const off = s.subscribe((e) => got.push(e));
    const para = pathOf(fx.root, (n) => n.text === "〔AI〕月ごとに合計します。");
    const link = pathOf(fx.root, (n) => n.text === "〔他〕pandas の公式文書（取ってきたページ）");
    s.onElements({ v: 1, type: "elements", app: "claude", method: "ax", root: fx.root, hover: para });
    s.tick(1);
    s.onElements({ v: 1, type: "elements", app: "claude", method: "ax", root: fx.root, hover: para }); // 同じ段落: hover は出さない
    s.onElements({ v: 1, type: "elements", app: "claude", method: "ax", root: fx.root, hover: link });
    s.tick(2); // 乗っていないので出さない
    off();
    s.onElements({ v: 1, type: "elements", app: "claude", method: "ax", root: fx.root, hover: para }); // 外したので届かない

    const kinds = got.map((e) => `${e.to}:${e.event.type}`);
    expect(kinds).toEqual(["passive:exposed", "hover:enter", "hover:tick", "passive:exposed", "passive:exposed", "hover:leave"]);
    const exposed = got[0]!.event as Extract<SupplyEvent["event"], { type: "exposed" }>;
    expect(exposed.items).toHaveLength(6);
    for (const it of exposed.items) {
      expect(Object.keys(it).sort()).toEqual(["item_id", "kind", "origin"]);
    }
    expect(JSON.stringify(got)).not.toContain("〔他〕");
    expect(s.stats().supplied).toBe(18);
    expect(netCalls).toBe(0);
  });

  it("丸の Node 側: elements の行は受け手にだけ渡り、ネイティブ・記録・ログ・seen に文が出ない", async () => {
    const fx = load("supply-mac-ax");
    const ee = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill: () => boolean };
    ee.stdin = new PassThrough();
    ee.stdout = new PassThrough();
    ee.stderr = new PassThrough();
    ee.kill = () => true;
    const written: string[] = [];
    ee.stdin.on("data", (b: Buffer) => written.push(b.toString("utf8")));
    const records: unknown[] = [];
    const logs: string[] = [];
    const supply = createOverlaySupply({ platform: "macos", hints: SYNTH, allowUnverified: true });
    const got: SupplyEvent[] = [];
    supply.subscribe((e) => got.push(e));
    const h = startOverlayHost({
      binary: "/fake",
      platform: "macos",
      settings: { ...DEFAULT_SETTINGS, panelUrl: "https://example.invalid/panel", sendTextToPanel: true },
      deps: {
        spawnNative: () => ee as never,
        appendRecord: async (r) => {
          records.push(r);
          return records.length;
        },
        log: (l) => logs.push(l),
        now: () => new Date(),
      },
      ff: false,
      supply,
    });
    await new Promise((r) => setImmediate(r));
    const line = JSON.stringify({ v: 1, type: "elements", app: "claude", method: "ax", root: fx.root, hover: null });
    expect(parseNativeLine(line)?.type).toBe("elements");
    ee.stdout.write(`${line}\n`);
    await new Promise((r) => setTimeout(r, 20));

    expect(got.map((e) => e.event.type)).toEqual(["exposed"]);
    const sent = written.join("");
    expect(sent).not.toContain("〔");
    expect(sent).not.toContain("panel-text");
    expect(records).toHaveLength(0);
    expect(logs.join("\n")).not.toContain("〔");
    expect(JSON.stringify(h.seen)).not.toContain("〔");
    expect(JSON.stringify(redactForLog(parseNativeLine(line)!))).not.toContain("〔");
    expect(netCalls).toBe(0);
    h.stop();
  });
});
