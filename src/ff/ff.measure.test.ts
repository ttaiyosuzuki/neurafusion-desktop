// FF-08 実測（Mac 実機）: 全体キーを受けてから最初の行を描くまで（ネイティブの ff-drawn.ms）を20回。
// 普段のテストでは流さない。NF_FF_MEASURE=1 のときだけ（本物の丸のプロセスを起動し、キーを OS に送るため）。
//   NF_FF_MEASURE=1 NF_OVERLAY_BIN=apps/nf-overlay-macos/.build/debug/nf-overlay node scripts/run-vitest.mjs run src/ff/ff.measure.test.ts
// キーは System Events で送る。全体キーの登録が通ったとき（ff-keys に失敗が無いとき）だけ送る
// （通っていないのに送ると、前面のアプリに文字が入ってしまうため）。
// 索引はテスト用（mode:"test"）。本番の索引は空なので「記録なし」しか出ない。時間を測るのは手の行。

import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { realHostDeps, startOverlayHost } from "../overlay/host.js";
import { normalizeSettings } from "../overlay/settings.js";
import * as runtime from "./engine/ff-runtime.js";
import type { FfIndexLike, FfState } from "./engine/contract.js";
import type { FfEngine } from "./engine.js";

const RUN = process.env.NF_FF_MEASURE === "1" && process.platform === "darwin";
const T = (verb: string, action = "edit") => `${action}|${verb}|-|ソフトウェア|code|mid`;
const A = T("型を直す");
const B = T("テストを足す");
const C = T("境界を確かめる", "probe");
const D = T("差分を出す", "artifact");

function testIndex(): FfIndexLike {
  const table: Record<string, Array<{ token: string; support_n: number; trace_refs: string[] }>> = {};
  const put = (recent: string[], token: string, n: number) => {
    for (const key of runtime.stateKeys(recent)) table[key] ??= [{ token, support_n: n, trace_refs: [`ref:${n}`] }];
  };
  put([A], B, 9);
  put([A, B], C, 7);
  put([B, C], D, 6);
  return { kind: "ff-index", version: 1, mode: "test", sources: [{ source_id: "fixture", provenance: "fixture" }], table } as FfIndexLike;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (code: number, mods: string) =>
  execFileSync("osascript", ["-e", `tell application "System Events" to key code ${code}${mods ? ` using {${mods}}` : ""}`]);

async function until(cond: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await sleep(10);
  }
  return cond();
}

describe.runIf(RUN)("FF-08 Mac 実機: キー → 最初の行の描画", () => {
  it("20回", { timeout: 180_000 }, async () => {
    const binary = process.env.NF_OVERLAY_BIN;
    expect(binary, "NF_OVERLAY_BIN").toBeTruthy();
    const logs: string[] = [];
    const engine: FfEngine = { foresee: runtime.foresee, nextPress: runtime.nextPress, toInstruction: runtime.toInstruction };
    const state: FfState = { recent_tokens: [A], last_edit: A, rejected: [], errors: [], probes: [] };
    const s = normalizeSettings({ enabled: Object.fromEntries(["claude", "chatgpt", "cursor", "notion", "gemini", "copilot", "perplexity"].map((id) => [id, false])) });
    const h = startOverlayHost({
      binary: binary!,
      platform: "macos",
      settings: s,
      deps: { ...realHostDeps((l) => logs.push(l)), appendRecord: async () => undefined },
      ff: {
        overrides: {
          engine,
          loadIndex: async () => testIndex(),
          readState: async () => state,
          copy: async () => ({ ok: true }),
          record: async () => undefined,
        },
      },
    });
    try {
      const wire = await h.ff!;
      await sleep(1500); // ff-config → 登録 → ff-keys
      expect(logs.filter((l) => l.includes("登録できませんでした")), logs.join("\n")).toEqual([]);
      const ctl = wire.controller;
      let skipped = 0;
      for (let i = 0; i < 20; i++) {
        const before = ctl.drawnMs.length;
        key(43, "option down, shift down"); // Option+Shift+, （起動）
        const drawn = await until(() => ctl.drawnMs.length > before, 3000);
        if (!drawn) skipped++;
        await sleep(250);
        if (ctl.isVisible) key(53, ""); // Esc（行が出ている間だけ登録されている）
        await until(() => !ctl.isVisible, 2000);
        await sleep(250);
      }
      const ms = [...ctl.drawnMs].sort((a, b) => a - b);
      const node = [...ctl.nodeFirstLineMs].sort((a, b) => a - b);
      const q = (xs: number[]) => ({ n: xs.length, median: (xs[Math.floor((xs.length - 1) / 2)]! + xs[Math.ceil((xs.length - 1) / 2)]!) / 2, p90: xs[Math.ceil(xs.length * 0.9) - 1]!, max: xs[xs.length - 1]! });
      const out = { at: new Date().toISOString(), binary: path.basename(path.dirname(binary!)), key_to_draw_ms: q(ms), node_ms: q(node), skipped, raw: ms };
      await writeFile("/tmp/ffd-measure-mac.json", JSON.stringify(out, null, 2));
      console.log(`FF_MAC_KEY_TO_DRAW n=${out.key_to_draw_ms.n} median=${out.key_to_draw_ms.median.toFixed(1)} p90=${out.key_to_draw_ms.p90.toFixed(1)} max=${out.key_to_draw_ms.max.toFixed(1)} skipped=${skipped}`);
      expect(ms.length).toBe(20);
      expect(ms.every((x) => x < 800)).toBe(true);
    } finally {
      h.stop();
      await sleep(500);
    }
  });
});
