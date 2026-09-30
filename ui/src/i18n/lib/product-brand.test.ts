import { describe, expect, it } from "vitest";
import { brandAssistantMap, brandAssistantText } from "./product-brand.ts";

describe("brandAssistantText", () => {
  it("names the built-in assistant NeuraFusion", () => {
    expect(brandAssistantText(["custodian", "panel", "title"], "OpenClaw")).toBe("NeuraFusion");
    expect(brandAssistantText(["custodian", "thinking"], "OpenClaw is thinking")).toBe(
      "NeuraFusion is thinking",
    );
    expect(brandAssistantText(["nav", "askOpenClaw"], "Ask OpenClaw")).toBe("Ask NeuraFusion");
    expect(brandAssistantText(["nav", "custodian"], "OpenClaw")).toBe("NeuraFusion");
    expect(
      brandAssistantText(["custodian", "panel", "dockRight"], "Ask OpenClaw を右側に固定"),
    ).toBe("Ask NeuraFusion を右側に固定");
    expect(
      brandAssistantText(
        ["triage", "hostHint"],
        "If Ask OpenClaw is unavailable, run `openclaw triage`.",
      ),
    ).toBe("If Ask NeuraFusion is unavailable, run `neurafusion triage`.");
    expect(
      brandAssistantText(["setup", "hint"], "Run `openclaw` or `openclaw doctor --fix`."),
    ).toBe("Run `neurafusion` or `neurafusion doctor --fix`.");
  });

  it("keeps facts about upstream", () => {
    const license = "© 2026 OpenClaw Foundation — MIT License.";
    expect(brandAssistantText(["about", "license"], license)).toBe(license);
    const community = "Join the OpenClaw community on Discord";
    expect(brandAssistantText(["community", "cardLabel"], community)).toBe(community);
  });

  it("brands a whole map", () => {
    expect(
      brandAssistantMap({
        custodian: { title: "OpenClaw", panel: { toggle: "Toggle Ask OpenClaw" } },
        about: { license: "© 2026 OpenClaw Foundation — MIT License." },
        count: 2,
      }),
    ).toEqual({
      custodian: { title: "NeuraFusion", panel: { toggle: "Toggle Ask NeuraFusion" } },
      about: { license: "© 2026 OpenClaw Foundation — MIT License." },
      count: 2,
    });
  });
});
