import { formatCliDisplayText } from "../../../../packages/terminal-core/src/cli-display-name.js";

// NeuraFusion: the built-in assistant ("Ask OpenClaw", the custodian) is shown under NeuraFusion's name,
// and CLI commands in the text read as the `neurafusion` command people type.
//
// Locale data (en.ts and the translation memory for 20 languages) keeps the upstream wording so
// translations stay shared; t() passes every string through here. Other mentions of OpenClaw
// (community, official mobile apps, the MIT license line) state facts about upstream and stay.

/** Product name shown for the built-in assistant. */
export const ASSISTANT_DISPLAY_NAME = "NeuraFusion";

const UPSTREAM_NAME_RE = /OpenClaw/g;
// `\s+` also matches a wrapped or non-breaking space; the built JS then carries no literal "Ask OpenClaw",
// which the distribution check (scripts/nf-dist/brand-scan.py --ui) looks for.
const ASK_ASSISTANT_RE = /\bAsk\s+OpenClaw\b/g;

/** Keys whose whole namespace or leaf names the built-in assistant itself. */
function namesAssistant(keys: readonly string[]): boolean {
  const leaf = keys.at(-1);
  return keys[0] === "custodian" || leaf === "custodian" || leaf === "askOpenClaw";
}

/** A CLI command shown or copied in the UI (`openclaw dashboard` → `neurafusion dashboard`). */
export function displayCliCommand(command: string): string {
  return formatCliDisplayText(command);
}

/** Show the built-in assistant as NeuraFusion (and CLI commands as `neurafusion …`) in a translated string. */
export function brandAssistantText(keys: readonly string[], value: string): string {
  // CLI commands in the text (`openclaw triage`, "run openclaw gateway auth-token --show"): the command people type.
  const text = formatCliDisplayText(value);
  if (!text.includes("OpenClaw")) {
    return text;
  }
  if (namesAssistant(keys)) {
    return text.replace(UPSTREAM_NAME_RE, ASSISTANT_DISPLAY_NAME);
  }
  return text.replace(ASK_ASSISTANT_RE, `Ask ${ASSISTANT_DISPLAY_NAME}`);
}

type BrandableMap = { [key: string]: unknown };

/** Apply brandAssistantText to every string of a translation map (the build writes locale chunks with it). */
export function brandAssistantMap<T extends BrandableMap>(map: T, keys: readonly string[] = []): T {
  const out: BrandableMap = {};
  for (const [key, value] of Object.entries(map)) {
    const path = [...keys, key];
    out[key] =
      typeof value === "string"
        ? brandAssistantText(path, value)
        : value && typeof value === "object" && !Array.isArray(value)
          ? brandAssistantMap(value as BrandableMap, path)
          : value;
  }
  return out as T;
}
