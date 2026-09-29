// NeuraFusion 配布物（DK-09）: 最上位の --help に、許可リスト（scripts/nf-dist/brand-allow-help.json。機能上の名前と
// 上流の外部サービスだけ・理由つき）以外の上流の名前・旧名・ロブスターが出ないことを守る。
// 配布物の検査（scripts/nf-dist/verify-installers.sh の --help の項目）と同じ許可リスト・同じ brand-scan.py を使う。
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_DISPLAY_NAME } from "../cli-name.js";
import { renderRootHelpText } from "./root-help.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ALLOW_FILE = path.join(ROOT, "scripts", "nf-dist", "brand-allow-help.json");
const BRAND = /openclaw|clawdbot|moltbot|clawd|clawhub|\u{1F99E}/giu;

type AllowItem = { name: string; pattern: string; reason: string };

/**
 * 本物の定義（核と sub-CLI の説明・大域の選択肢・例・文書の行）から組んだ最上位の --help。色（SGR）とリンク（OSC 8）は外す
 * （配布物の検査は端末でない所で --help を受けるので、素の文字と同じにする）。
 */
async function plainRootHelp(): Promise<string> {
  return (await renderRootHelpText())
    .replace(/\u001b\]8;;[^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-9;]*m/g, "");
}

function readAllowList(): AllowItem[] {
  return (JSON.parse(readFileSync(ALLOW_FILE, "utf8")) as { allow: AllowItem[] }).allow;
}

/** 許可した名前を消してから、残った上流の名前を行ごとに返す。 */
function disallowedHits(text: string): string[] {
  let masked = text;
  for (const item of readAllowList()) {
    masked = masked.replace(new RegExp(item.pattern, "g"), (m) => " ".repeat(m.length));
  }
  const lines = text.split("\n");
  return masked
    .split("\n")
    .flatMap((line, i) => (line.match(BRAND) ? [lines[i]?.trim() ?? ""] : []));
}

describe("最上位の --help の名前（NeuraFusion）", () => {
  it("許可リストの項目はどれも名前・正規表現・理由を持つ", () => {
    const allow = readAllowList();
    expect(allow.length).toBeGreaterThan(0);
    for (const item of allow) {
      expect(item.name.trim(), JSON.stringify(item)).not.toBe("");
      expect(item.reason.trim(), JSON.stringify(item)).not.toBe("");
      expect(() => new RegExp(item.pattern)).not.toThrow();
      // 製品名としての OpenClaw・コマンド名 openclaw を丸ごと許す項目は入れない
      expect(new RegExp(item.pattern).test("OpenClaw"), item.name).toBe(false);
      expect(new RegExp(item.pattern).test("openclaw onboard"), item.name).toBe(false);
    }
  });

  it("Usage と例は neurafusion、許可リスト以外の上流の名前は 0 件", async () => {
    const help = await plainRootHelp();
    expect(help).toMatch(new RegExp(`^Usage: ${CLI_DISPLAY_NAME} \\[options\\] \\[command\\]$`, "m"));
    expect(help).toContain(`  ${CLI_DISPLAY_NAME} onboard\n`);
    expect(disallowedHits(help)).toEqual([]);
  });

  it.skipIf(spawnSync("python3", ["--version"]).status !== 0)(
    "配布物の検査と同じ brand-scan.py --allow でも 0 件（許可した件数を出す）",
    async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), "nf-help-brand-"));
      const file = path.join(dir, "help.out");
      writeFileSync(file, await plainRootHelp());
      const scan = spawnSync(
        "python3",
        [path.join(ROOT, "scripts", "nf-dist", "brand-scan.py"), "--allow", ALLOW_FILE, file],
        { encoding: "utf8" },
      );
      expect(scan.stdout).toMatch(/^許可 \d+ 件/);
      expect(scan.status).toBe(0);
    },
  );

  it("許可リストは製品名の OpenClaw を見逃さない（壊した --help で確かめる）", () => {
    const broken = [
      "Usage: openclaw [options] [command]",
      "  --dev   isolate state under ~/.openclaw-dev (default: env OPENCLAW_CONTAINER)",
      "  plugins *   Manage OpenClaw plugins and extensions",
      "  promos *    Discover offers from ClawHub",
      "Docs: https://docs.openclaw.ai/cli",
    ].join("\n");
    expect(disallowedHits(broken)).toEqual([
      "Usage: openclaw [options] [command]",
      "plugins *   Manage OpenClaw plugins and extensions",
    ]);
  });
});
