// FF「先読み」デスクトップ（Node 側）の自動テスト — FF-01〜08 のうち Node で確かめられる分:
//   キーの既定・検査（⌘P 不可・既存の NF のキーと重ねない）／押すまで何も出ない／実在の記録が無い手は出ない／
//   もう一度押す（さらに先・別の枝）／これで行く→指示文（クリップボード・OpenClaw の入力欄 URL）／記録の形／
//   画面共有から隠す API を使っていない（静的検査）／Node の中の「キー → 最初の行」20回。
// エンジンは同梱のバンドル（src/ff/engine/ff-runtime.js＝engine/ff）をそのまま使う。

import { EventEmitter } from "node:events";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { startOverlayHost, type OverlayHostDeps } from "../overlay/host.js";
import { normalizeSettings } from "../overlay/settings.js";
import * as runtime from "./engine/ff-runtime.js";
import type { FfEvent, FfIndexLike, FfMove, FfState } from "./engine/contract.js";
import { copyToClipboard, locateOpenclawUi, openclawDraftUrl, sendDraftToOpenclaw, type Spawner } from "./deliver.js";
import { checkProductionIndex, emptyProductionIndex, loadEngine, loadProductionIndex, NO_RECORD_ENGINE, type FfEngine } from "./engine.js";
import { FF_DEFAULT_KEYS, chordLabel, parseChord, resolveBinding, validateBinding } from "./keys.js";
import { parseFfLine, type FfInbound } from "./protocol.js";
import { eventLine } from "./record.js";
import { FF_TEXT, FfController, type FfSessionDeps } from "./session.js";
import { buildFfConfig, normalizeFfSettings } from "./settings.js";
import { isNormalizedToken, stateFromLines, statePattern } from "./state.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const engine: FfEngine = { foresee: runtime.foresee, nextPress: runtime.nextPress, toInstruction: runtime.toInstruction };

// declang の正規トークン（action|verb_cat|slot|field|tool_class|novelty_bkt）
const T = (verb: string, action = "edit") => `${action}|${verb}|-|ソフトウェア|code|mid`;
const A = T("型を直す");
const B = T("テストを足す");
const C = T("境界を確かめる", "probe");
const D = T("差分を出す", "artifact");
const E = T("記録を残す", "artifact");
const F = T("別案を試す", "choose");
const G = T("手順を書く", "artifact");

const entry = (token: string, n: number, refs = [`ref:${n.toString(16).padStart(8, "0")}`]) => ({ token, support_n: n, trace_refs: refs });

/** テスト用の索引（mode:"test"。本番の面では読まない形）。A の次は B（N=9）か F（N=4）。 */
function testIndex(): FfIndexLike {
  const table: Record<string, ReturnType<typeof entry>[]> = {};
  const put = (recent: string[], rows: ReturnType<typeof entry>[]) => {
    for (const key of runtime.stateKeys(recent)) table[key] ??= rows;
  };
  put([A], [entry(B, 9), entry(F, 4)]);
  put([A, B], [entry(C, 7)]);
  put([B, C], [entry(D, 6)]);
  put([C, D], [entry(E, 5)]);
  put([D, E], [entry(G, 3)]);
  put([A, F], [entry(G, 2)]);
  return { kind: "ff-index", version: 1, mode: "test", sources: [{ source_id: "fixture", provenance: "fixture" }], table } as FfIndexLike;
}

const stateOf = (recent: string[]): FfState => ({ recent_tokens: recent, last_edit: recent.at(-1) ?? null, rejected: [], errors: [], probes: [] });

type Harness = {
  ctl: FfController;
  sent: FfInbound[];
  copied: string[];
  drafted: string[];
  events: FfEvent[];
  fire: () => void;
};

/** 時計とタイマーを手で進める（2行目からの間・閉じるまでの時間） */
function harness(opts: { index?: FfIndexLike; state?: FfState; draft?: boolean; eng?: FfEngine } = {}): Harness {
  const sent: FfInbound[] = [];
  const copied: string[] = [];
  const drafted: string[] = [];
  const events: FfEvent[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];
  let n = 0;
  const deps: FfSessionDeps = {
    engine: opts.eng ?? engine,
    loadIndex: async () => opts.index ?? testIndex(),
    readState: async () => opts.state ?? stateOf([A]),
    send: (m) => sent.push(m),
    copy: async (t) => {
      copied.push(t);
      return { ok: true };
    },
    ...(opts.draft
      ? {
          draftToOpenclaw: async (t: string) => {
            drafted.push(t);
            return { ok: true };
          },
        }
      : {}),
    record: async (e) => {
      events.push(e);
    },
    now: () => performance.now(),
    newId: () => `ffs_${++n}`,
    setTimer: (fn, ms) => {
      const t = { fn, ms };
      timers.push(t);
      return { cancel: () => void timers.splice(timers.indexOf(t) >>> 0, timers.includes(t) ? 1 : 0) };
    },
    target: "openclaw",
    k: 3,
    lineGapMs: 0,
    idleMs: 20_000,
    afterAdoptMs: 0,
  };
  return {
    ctl: new FfController(deps),
    sent,
    copied,
    drafted,
    events,
    // 行の間・これで行くのあとの短いタイマーだけ進める（触らないまま閉じる 20 秒は進めない）
    fire: () => {
      for (let i = 0; i < 20; i++) {
        const t = timers.find((x) => x.ms < 1000);
        if (!t) break;
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
  };
}

const settle = async (h: Harness, rounds = 6) => {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setImmediate(r));
    h.fire();
  }
  await new Promise((r) => setImmediate(r));
};

const lines = (sent: FfInbound[]) => sent.filter((m): m is Extract<FfInbound, { type: "ff-line" }> => m.type === "ff-line");

describe("FF-01 全体キー", () => {
  it("既定は engine/ff/keys.json と同じで、⌘P・Ctrl+P・既存の NF のキーと重ならない", () => {
    expect(FF_DEFAULT_KEYS).toEqual({ trigger: "Alt+Shift+,", adopt: "Alt+Shift+.", close: "Escape" });
    const scopes = runtime.FF_KEYS as { actions: Record<string, { scope?: string }> };
    expect(scopes.actions.trigger!.scope).toBe("global");
    expect(scopes.actions.adopt!.scope).toBe("overlay-only");
    expect(validateBinding(FF_DEFAULT_KEYS)).toEqual([]);
    const k = runtime.FF_KEYS as { actions: Record<string, { mac: string; windows: string; linux: string }> };
    for (const a of ["trigger", "adopt", "close"] as const) {
      expect(parseChord(k.actions[a]!.mac)).toEqual(parseChord(FF_DEFAULT_KEYS[a]));
      expect(parseChord(k.actions[a]!.windows)).toEqual(parseChord(FF_DEFAULT_KEYS[a]));
      expect(parseChord(k.actions[a]!.linux)).toEqual(parseChord(FF_DEFAULT_KEYS[a]));
    }
  });

  it("書き方の違い（Option・Period・⌘⇧9）を同じ正規形に読む", () => {
    expect(parseChord("Option+Shift+Period")).toEqual({ mods: ["alt", "shift"], key: "." });
    expect(parseChord("⌘⇧9")).toEqual({ mods: ["shift", "meta"], key: "9" });
    expect(parseChord("Command+P")).toEqual({ mods: ["meta"], key: "p" });
    expect(parseChord("Alt+Shift+Bogus")).toBeNull();
    expect(chordLabel(parseChord("Alt+Shift+,")!, "macos")).toBe("Option+Shift+,");
    expect(chordLabel(parseChord("Alt+Shift+.")!, "windows")).toBe("Alt+Shift+.");
  });

  it("⌘P・既存の NF のキー・修飾なし・同じキーの重複は通さず、既定に戻す", () => {
    const codes = (t: string, a = FF_DEFAULT_KEYS.adopt) => validateBinding({ trigger: t, adopt: a, close: "Escape" }).map((p) => p.code);
    expect(codes("Command+P")).toContain("forbidden");
    expect(codes("Ctrl+P")).toContain("forbidden");
    expect(codes("Alt+Shift+N")).toContain("existing-nf-key");
    expect(codes("Command+Shift+9")).toContain("existing-nf-key");
    expect(codes("Shift+K")).toContain("needs-modifier");
    expect(codes("Alt+Shift+.")).toContain("duplicate");
    expect(resolveBinding({ trigger: "Command+P" }).binding).toEqual(FF_DEFAULT_KEYS);
    expect(resolveBinding({ trigger: "Ctrl+Alt+J" }).binding.trigger).toBe("Ctrl+Alt+J");
  });

  it("設定で変えたキーは丸の設定（~/.neurafusion/overlay/settings.json の ff）に残り、ff-config で渡る", () => {
    const s = normalizeSettings({ ff: { keys: { trigger: "Ctrl+Alt+J" }, opacity: 2, target: "cursor" } });
    expect(s.ff.keys.trigger).toBe("Ctrl+Alt+J");
    expect(s.ff.opacity).toBe(0.95);
    expect(s.ff.target).toBe("cursor");
    const { msg } = buildFfConfig(s.ff, "linux");
    expect(msg.keys.trigger).toEqual({ mods: ["ctrl", "alt"], key: "j" });
    expect(msg.keys.close).toEqual({ mods: [], key: "escape" });
    expect(msg.scopes).toEqual({ trigger: "global", adopt: "overlay-only", close: "overlay-only" });
    expect(msg.labels.trigger).toBe("Ctrl+Alt+J");
    expect(normalizeFfSettings(undefined).openclawDraft).toBe(false);
  });
});

describe("FF-06/08 押すまで何も出ない（丸のホストごと）", () => {
  function fakeChild() {
    const ee = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill: () => boolean };
    ee.stdin = new PassThrough();
    ee.stdout = new PassThrough();
    ee.stderr = new PassThrough();
    ee.kill = () => true;
    return ee;
  }

  it("起動しても ff-config だけ。adopt・close を押しても何も出ない。trigger で初めて行が出る", async () => {
    const child = fakeChild();
    const written: string[] = [];
    child.stdin.on("data", (b: Buffer) => written.push(...b.toString("utf8").split("\n").filter(Boolean)));
    const copied: string[] = [];
    const deps: OverlayHostDeps = { spawnNative: () => child, appendRecord: async () => undefined, log: () => undefined, now: () => new Date() };
    const h = startOverlayHost({
      binary: "fake",
      platform: "macos",
      settings: normalizeSettings(undefined),
      deps,
      ff: {
        overrides: {
          engine,
          loadIndex: async () => testIndex(),
          readState: async () => stateOf([A]),
          copy: async (t) => {
            copied.push(t);
            return { ok: true };
          },
          record: async () => undefined,
          lineGapMs: 0,
        },
      },
    });
    await h.ff;
    const types = () => written.map((l) => JSON.parse(l).type as string);
    expect(types()).toEqual(["config", "ff-config"]);
    child.stdout.write(`${JSON.stringify({ v: 1, type: "ff-key", action: "adopt", press: 1 })}\n`);
    child.stdout.write(`${JSON.stringify({ v: 1, type: "ff-key", action: "close", press: 2 })}\n`);
    await new Promise((r) => setTimeout(r, 30));
    expect(types()).toEqual(["config", "ff-config"]);
    expect(copied).toEqual([]);
    child.stdout.write(`${JSON.stringify({ v: 1, type: "ff-key", action: "trigger", press: 3 })}\n`);
    await new Promise((r) => setTimeout(r, 30));
    const ff = written.map((l) => JSON.parse(l)).filter((m) => m.type === "ff-line");
    expect(ff.length).toBeGreaterThanOrEqual(1);
    expect(ff[0]).toMatchObject({ press: 3, seq: 0, kind: "move", reset: true });
    // ネイティブの ff-drawn を受け取る
    child.stdout.write(`${JSON.stringify({ v: 1, type: "ff-drawn", press: 3, seq: 0, ms: 12.5 })}\n`);
    await new Promise((r) => setTimeout(r, 10));
    expect((await h.ff)!.controller.drawnMs).toEqual([12.5]);
    h.stop();
  });

  it("parseFfLine は ff-* だけを読み、丸の行・壊れた行は読まない", () => {
    expect(parseFfLine('{"v":1,"type":"ff-key","action":"trigger","press":1}')).toMatchObject({ type: "ff-key" });
    expect(parseFfLine('{"v":1,"type":"ff-key","action":"print","press":1}')).toBeNull();
    expect(parseFfLine('{"v":1,"type":"clicked","app":"claude"}')).toBeNull();
    expect(parseFfLine("not json")).toBeNull();
  });
});

describe("FF-02 実在の記録が無い手は出ない", () => {
  it("本番の空の索引: 「記録なし」の1行だけ。手は0、これで行くを押してもクリップボードに入らない", async () => {
    const h = harness({ index: emptyProductionIndex() });
    await h.ctl.onKey("trigger", 1);
    await settle(h);
    expect(lines(h.sent).map((l) => [l.kind, l.text])).toEqual([["none", FF_TEXT.noRecord]]);
    await h.ctl.onKey("adopt", 2);
    await settle(h);
    expect(h.copied).toEqual([]);
    expect(h.events.filter((e) => e.kind === "adopt")).toEqual([]);
  });

  it("状態が読めない（空）: 「記録なし（…読めませんでした）」だけ", async () => {
    const h = harness({ state: stateOf([]) });
    await h.ctl.onKey("trigger", 1);
    await settle(h);
    expect(lines(h.sent).map((l) => l.text)).toEqual([FF_TEXT.noState]);
  });

  it("エンジンのバンドルが無いときは手を作らない（NO_RECORD_ENGINE）", async () => {
    const h = harness({ eng: NO_RECORD_ENGINE });
    await h.ctl.onKey("trigger", 1);
    await settle(h);
    expect(lines(h.sent).every((l) => l.kind === "none")).toBe(true);
    const loaded = await loadEngine(async () => {
      throw new Error("無い");
    });
    expect(loaded.bundled).toBe(false);
    expect((await loadEngine()).bundled).toBe(true);
  });

  it("本番の面は mode:test・real 以外の出どころの索引を読まない", async () => {
    expect(checkProductionIndex(testIndex())).toEqual({ ok: false, reason: "not-production" });
    const synthetic = { ...(testIndex() as object), mode: "production", sources: [{ source_id: "gen", provenance: "synthetic" }] };
    expect(checkProductionIndex(synthetic)).toEqual({ ok: false, reason: "not-real-source" });
    const real = { ...(testIndex() as object), mode: "production", sources: [{ source_id: "ck01", provenance: "real" }] };
    expect(checkProductionIndex(real)).toEqual({ ok: true });
    const dir = await mkdtemp(path.join(os.tmpdir(), "ff-idx-"));
    expect((await loadProductionIndex(dir)).check).toEqual({ ok: false, reason: "missing" });
    await writeFile(path.join(dir, "index.json"), JSON.stringify(synthetic));
    const r = await loadProductionIndex(dir);
    expect(r.check.ok).toBe(false);
    expect((r.index as { table: object }).table).toEqual({});
  });

  it("手はすべて N≥1 で、trace_refs を持つ（索引にある手だけ）", async () => {
    const h = harness();
    await h.ctl.onKey("trigger", 1);
    await settle(h);
    const moves = lines(h.sent).filter((l) => l.kind === "move");
    expect(moves.length).toBe(3);
    expect(moves.map((l) => l.n)).toEqual([9, 7, 6]);
    expect(moves.every((l) => (l.n ?? 0) >= 1)).toBe(true);
    const shown = h.events.find((e) => e.kind === "shown")!;
    expect(shown.moves.map((m) => m.token)).toEqual([B, C, D]);
  });
});

describe("FF-03 もう一度押す", () => {
  it("さらに先（depth+1）→ 尽きたら別の枝（前の行を消す）→ 枝も尽きたら「この先の記録はありません」", async () => {
    const h = harness();
    await h.ctl.onKey("trigger", 1);
    await settle(h);
    await h.ctl.onKey("trigger", 2);
    await settle(h);
    const p2 = lines(h.sent).filter((l) => l.press === 2);
    expect(p2[0]?.reset).toBeUndefined(); // さらに先は続けて足す
    expect(p2.filter((l) => l.kind === "move").map((l) => l.n)).toEqual([5, 3]);
    await h.ctl.onKey("trigger", 3);
    await settle(h);
    const p3 = lines(h.sent).filter((l) => l.press === 3);
    expect(p3[0]).toMatchObject({ reset: true, kind: "move", n: 4 }); // 別の枝（F）
    expect(h.events.map((e) => e.kind)).toContain("branch");
    let press = 4;
    for (; press < 8; press++) {
      await h.ctl.onKey("trigger", press);
      await settle(h);
      if (lines(h.sent).some((l) => l.press === press && l.text === FF_TEXT.noFurther)) break;
    }
    expect(press).toBeLessThan(8);
  });
});

describe("FF-04/05 これで行く・記録", () => {
  it("ここまでの道筋を指示文にしてクリップボードへ。指示文は engine の toInstruction と一字一句同じ", async () => {
    const h = harness({ draft: true });
    await h.ctl.onKey("trigger", 1);
    await settle(h);
    await h.ctl.onKey("adopt", 2);
    await settle(h);
    const shown = h.events.find((e) => e.kind === "shown")!;
    const pathMoves = shown.moves as FfMove[];
    expect(h.copied).toHaveLength(1);
    // toInstruction が使うのは step・label・support_n（label は engine の labelOf）
    const expected = runtime.toInstruction(
      pathMoves.map((m) => ({ ...m, label: runtime.labelOf(m.token), trace_refs: ["ref:x"] }) as FfMove),
      "openclaw",
    );
    expect(h.copied[0]).toBe(expected);
    expect(h.drafted).toEqual([expected]);
    const adopt = h.events.find((e) => e.kind === "adopt")!;
    expect(adopt.upto_step).toBe(3);
    const info = lines(h.sent).filter((l) => l.kind === "info").map((l) => l.text);
    expect(info).toEqual([FF_TEXT.copied(3), FF_TEXT.drafted]);
    expect(h.sent.at(-1)).toEqual({ v: 1, type: "ff-hide" });
  });

  it("閉じる: どこで止めたか（stop）と見ただけ（dismiss）を残して隠す", async () => {
    const h = harness();
    await h.ctl.onKey("trigger", 1);
    await settle(h);
    await h.ctl.onKey("close", 2);
    await settle(h);
    const kinds = h.events.map((e) => e.kind);
    expect(kinds).toEqual(["shown", "stop", "dismiss"]);
    expect(h.events.find((e) => e.kind === "stop")!.upto_step).toBe(3);
    expect(h.ctl.isVisible).toBe(false);
  });

  it("記録の1行は正規トークン・位置・支持数・patternId・時刻だけ（label・trace_refs・本文は書かない）", async () => {
    const h = harness();
    await h.ctl.onKey("trigger", 1);
    await settle(h);
    const line = JSON.parse(eventLine(h.events[0]!));
    expect(Object.keys(line).sort()).toEqual(["at", "kind", "moves", "session", "state_pattern"]);
    expect(Object.keys(line.moves[0]).sort()).toEqual(["branch", "depth", "step", "support_n", "token"]);
    expect(line.state_pattern).toBe(statePattern(stateOf([A])));
  });

  it("OpenClaw の入力欄へ: 公式の ?draft= の URL（127.0.0.1・トークンなし）を OS の既定で開くだけ", async () => {
    const cfg = `{ // JSON5
      gateway: { port: 19001, auth: { mode: "token" }, controlUi: { basePath: "/ui/" } },
      agents: { defaults: { port: 1 } } }`;
    const ui = await locateOpenclawUi({}, async () => cfg);
    expect(ui).toEqual({ port: 19001, basePath: "/ui" });
    expect((await locateOpenclawUi({ OPENCLAW_GATEWAY_PORT: "18800" }, async () => cfg)).port).toBe(18800);
    expect((await locateOpenclawUi({}, async () => { throw new Error("none"); })).port).toBe(18789);
    const url = openclawDraftUrl(ui, "1. 型を直す\n2. テスト");
    expect(url).toBe(`http://127.0.0.1:19001/ui/chat/main?draft=${encodeURIComponent("1. 型を直す\n2. テスト")}`);
    expect(url).not.toMatch(/token|#/i);
    const calls: Array<[string, string[]]> = [];
    const run: Spawner = async (cmd, args) => {
      calls.push([cmd, args]);
      return { code: 0 };
    };
    expect(await sendDraftToOpenclaw("x", "macos", { run, readText: async () => cfg })).toEqual({ ok: true });
    expect(calls[0]![0]).toBe("open");
    expect(calls[0]![1][0]).toContain("/chat/main?draft=x");
  });

  it.runIf(process.platform === "darwin")("Mac: 指示文が本物のクリップボードに一字一句そのまま入る", async () => {
    const text = runtime.toInstruction(
      [{ step: 1, token: B, label: runtime.labelOf(B), support_n: 9, trace_refs: ["ref:1"], branch: 0, depth: 0 } as unknown as FfMove],
      "claude-code",
    );
    const r = await copyToClipboard(text, "macos");
    expect(r.ok).toBe(true);
    const back = execFileSync("pbpaste", [], { env: { ...process.env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" } }).toString("utf8");
    expect(back).toBe(text);
  });
});

describe("FF-02 状態の読み取り（端末内の正規トークンだけ）", () => {
  it("正規トークンの形だけを通し、本文らしい行は捨てる", () => {
    expect(isNormalizedToken(A)).toBe(true);
    expect(isNormalizedToken("<session>")).toBe(true);
    expect(isNormalizedToken("edit|直す|-|x|code|mid|extra")).toBe(false);
    expect(isNormalizedToken("edit|taro@example.com に送る|-|x|code|mid")).toBe(false);
    expect(isNormalizedToken("明日の会議の件、よろしくお願いします")).toBe(false);
    const { state, dropped } = stateFromLines([
      JSON.stringify({ k: "edit", t: A }),
      JSON.stringify({ k: "reject", t: F }),
      JSON.stringify({ k: "error", t: T("型の誤り", "probe") }),
      JSON.stringify({ k: "recent", t: "生の本文そのもの" }),
      "壊れた行",
    ]);
    expect(state.recent_tokens).toEqual([A]);
    expect(state.last_edit).toBe(A);
    expect(state.rejected).toEqual([F]);
    expect(dropped).toBe(2);
  });
});

describe("FF-07 画面共有から隠す API を使わない（静的検査）", () => {
  it("apps/nf-overlay-* と src/ff・src/overlay のコードに該当の API が無い", async () => {
    const forbidden = [
      /sharingType/,
      /NSWindowSharingNone/,
      /SetWindowDisplayAffinity/,
      /WDA_EXCLUDEFROMCAPTURE/,
      /WDA_MONITOR/,
      /setContentProtection/,
      /_NET_WM_BYPASS_COMPOSITOR.*capture/i,
    ];
    const dirs = ["apps/nf-overlay-macos/Sources", "apps/nf-overlay-windows/src", "apps/nf-overlay-linux/nf_overlay", "src/ff", "src/overlay"];
    const hits: string[] = [];
    let scanned = 0;
    const walk = async (d: string): Promise<void> => {
      for (const ent of await readdir(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) {
          if (["bin", "obj", ".build", "node_modules", "__pycache__"].includes(ent.name)) continue;
          await walk(p);
        } else if (/\.(swift|cs|py|ts|js|c)$/.test(ent.name) && !/\.test\.ts$/.test(ent.name)) {
          scanned++;
          const text = await readFile(p, "utf8");
          for (const re of forbidden) if (re.test(text)) hits.push(`${path.relative(ROOT, p)}: ${re}`);
        }
      }
    };
    for (const d of dirs) await walk(path.join(ROOT, d));
    expect(scanned).toBeGreaterThan(30);
    expect(hits).toEqual([]);
  });
});

describe("FF-08 Node の中の「キー → 最初の行」（20回）", () => {
  it("20回とも 800ms 未満（中央値と遅い方から1割の値を出す）", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ff-lat-"));
    await mkdir(dir, { recursive: true });
    const h = harness();
    for (let i = 0; i < 20; i++) {
      await h.ctl.onKey("trigger", i * 2 + 1);
      await h.ctl.onKey("close", i * 2 + 2);
      await settle(h, 2);
    }
    const ms = [...h.ctl.nodeFirstLineMs].sort((a, b) => a - b);
    expect(ms).toHaveLength(20);
    const median = (ms[9]! + ms[10]!) / 2;
    const p90 = ms[17]!; // 遅い方から1割（20回の 18 番目）
    await writeFile(path.join(dir, "node-first-line.json"), JSON.stringify({ ms, median, p90 }));
    console.log(`FF_NODE_FIRST_LINE_MS n=20 median=${median.toFixed(2)} p90=${p90.toFixed(2)} max=${ms[19]!.toFixed(2)}`);
    expect(ms.every((x) => x < 800)).toBe(true);
  });
});
