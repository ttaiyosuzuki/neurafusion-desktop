// Parses gateway process command lines for process discovery.
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { normalizeStringEntries } from "@openclaw/normalization-core/string-normalization";

function normalizeProcArg(arg: string): string {
  return normalizeLowercaseStringOrEmpty(arg.replaceAll("\\", "/"));
}

const ENTRY_CANDIDATES = [
  "dist/index.js",
  "dist/entry.js",
  "openclaw.mjs",
  "scripts/run-node.mjs",
  "src/entry.ts",
  "src/index.ts",
] as const;

export function parseProcCmdline(raw: string): string[] {
  return normalizeStringEntries(raw.split("\0"));
}

export function isOpenClawArgv(args: string[]): boolean {
  const normalized = args.map(normalizeProcArg);
  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  if (normalized.some((arg) => ENTRY_CANDIDATES.some((entry) => arg.endsWith(entry)))) {
    return true;
  }
  /* ★2026-09-18 リブランドで `neurafusion` でも起動できる。片方だけだと
     Gateway の自分判定が外れ、二重起動の検出などが黙って効かなくなる。 */
  return ["openclaw", "neurafusion"].some((n) => exe.endsWith(`/${n}`) || exe === n);
}

export function isOpenClawCommandArgv(args: string[], command: string): boolean {
  const normalizedCommand = normalizeProcArg(command);
  return args.some((arg) => normalizeProcArg(arg) === normalizedCommand) && isOpenClawArgv(args);
}

export function isGatewayArgv(args: string[], opts?: { allowGatewayBinary?: boolean }): boolean {
  const normalized = args.map(normalizeProcArg);
  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  const isGatewayBinary = exe.endsWith("/openclaw-gateway") || exe === "openclaw-gateway";
  if (!isOpenClawCommandArgv(args, "gateway")) {
    return opts?.allowGatewayBinary === true && isGatewayBinary;
  }
  return true;
}
