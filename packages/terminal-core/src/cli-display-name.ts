// NeuraFusion: command name shown to people in hints and help text.
//
// The package installs one entry under two names (package.json bin): `neurafusion` is the name people
// type, `openclaw` stays as a compatibility alias. Code across the CLI still writes hints as
// `openclaw doctor`; the output exits (help, runtime log/error, console log lines, notes) pass text
// through formatCliDisplayText so people see `neurafusion doctor`. Only command mentions change:
// paths (`~/.openclaw`, `/bin/openclaw`), package names (`@openclaw/…`), URLs (`docs.openclaw.ai`),
// env names (`OPENCLAW_*`) and `npx openclaw …` (that would fetch another package) stay as they are.

/** Canonical binary name for completion, process labels, and repair hints (kept for compatibility). */
export const CLI_NAME = "openclaw";

/** Command name shown to people (the `neurafusion` bin in package.json). */
export const CLI_DISPLAY_NAME = "neurafusion";

// `openclaw` as a command: after start, whitespace, quote/bracket or an ANSI color code, and before
// whitespace + a word/option/placeholder, a closing backtick, or an ANSI code. Not after path,
// package, domain or word characters, and not after a package runner (npx/bunx/pnpm dlx/npm exec).
// A bare quoted "openclaw" (package names in JSON) is left alone.
const COMMAND_MENTION_RE =
  /(?<=^|[\s`'"(\[{<>:=,;|&]|\u001b\[[0-9;]*m)(?<!(?:\bnpx|\bbunx|\bdlx|\bexec|\bpnpm|\bnpm|\byarn)[ \t]+)openclaw(?=[ \t]+(?:--?[A-Za-z]|[a-z<[])|`|\u001b\[)/gm;

/** Show command mentions of the `openclaw` alias as the `neurafusion` command people type. */
export function formatCliDisplayText(text: string): string {
  if (!text.includes(CLI_NAME)) {
    return text;
  }
  return text.replace(COMMAND_MENTION_RE, CLI_DISPLAY_NAME);
}
