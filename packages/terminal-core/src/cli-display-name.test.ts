import { describe, expect, it } from "vitest";
import { CLI_DISPLAY_NAME, CLI_NAME, formatCliDisplayText } from "./cli-display-name.js";

describe("formatCliDisplayText", () => {
  it("shows command mentions as the neurafusion command", () => {
    expect(CLI_NAME).toBe("openclaw");
    expect(CLI_DISPLAY_NAME).toBe("neurafusion");
    expect(formatCliDisplayText("Run openclaw doctor --fix.")).toBe(
      "Run neurafusion doctor --fix.",
    );
    expect(formatCliDisplayText("Usage: openclaw daemon [options] [command]")).toBe(
      "Usage: neurafusion daemon [options] [command]",
    );
    expect(formatCliDisplayText("Usage: openclaw [options] [command]")).toBe(
      "Usage: neurafusion [options] [command]",
    );
    expect(formatCliDisplayText("  openclaw channels list\n  openclaw --dev gateway")).toBe(
      "  neurafusion channels list\n  neurafusion --dev gateway",
    );
    expect(formatCliDisplayText("Try `openclaw status --deep` or `openclaw`.")).toBe(
      "Try `neurafusion status --deep` or `neurafusion`.",
    );
    expect(formatCliDisplayText("(use openclaw status --deep for more)")).toBe(
      "(use neurafusion status --deep for more)",
    );
    expect(formatCliDisplayText('{"hint":"openclaw doctor"}')).toBe(
      '{"hint":"neurafusion doctor"}',
    );
  });

  it("keeps colored command mentions colored", () => {
    expect(formatCliDisplayText("\u001b[36mopenclaw doctor\u001b[39m")).toBe(
      "\u001b[36mneurafusion doctor\u001b[39m",
    );
    expect(formatCliDisplayText("run \u001b[36mopenclaw\u001b[39m")).toBe(
      "run \u001b[36mneurafusion\u001b[39m",
    );
  });

  it("leaves paths, packages, URLs, env names, runners and tags alone", () => {
    for (const text of [
      "~/.openclaw/openclaw.json",
      "/usr/local/bin/openclaw doctor",
      "@openclaw/ai",
      "https://docs.openclaw.ai/cli",
      "https://github.com/openclaw/openclaw issues",
      "OPENCLAW_STATE_DIR",
      "npx openclaw doctor",
      "pnpm openclaw gateway",
      "npm exec openclaw doctor",
      "[openclaw] Reason: x",
      'package "openclaw"',
      "openclaw-gateway",
      "openclaw.mjs",
      "npm install -g openclaw@latest",
      "OpenClaw Foundation",
    ]) {
      expect(formatCliDisplayText(text)).toBe(text);
    }
  });
});
