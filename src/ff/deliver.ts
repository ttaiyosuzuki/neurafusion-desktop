// FF「先読み」— 指示文の渡し方（FF-04）。NF は操作を実行しない。文を渡すだけ。
//  ① クリップボード（必須・既定）
//  ② OpenClaw への直接送信: 本人の OpenClaw の会話の入力欄に指示文を入れるだけ。送信は本人が押す。
//     公式 docs（docs/web/urls.md「The one-shot composer value `?draft=`」・route 表の `/chat` `?draft=<text>`）の
//     `http://127.0.0.1:<port>/chat/<agentId>?draft=<text>` を OS の既定のブラウザで開く。
//     `chat.send`・`sessions.send`・`openclaw agent -m` はすぐに実行が始まるので使わない。
//     資格情報は使わない（URL にトークンを載せない。ブラウザが持っている端末の資格で開く）。

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FfPlatform } from "./keys.js";

export type Spawner = (
  cmd: string,
  args: string[],
  input?: string,
  env?: NodeJS.ProcessEnv,
) => Promise<{ code: number | null }>;

export const realSpawner: Spawner = (cmd, args, input, env) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"], env: env ?? process.env, windowsHide: true });
    child.on("error", () => resolve({ code: null }));
    child.on("exit", (code) => resolve({ code }));
    child.stdin?.end(input ?? "");
  });

/** クリップボードに入れるコマンド（OS ごと）。Linux は Wayland なら wl-copy、X11 なら xclip → xsel。 */
export function clipboardCommands(platform: FfPlatform, env: NodeJS.ProcessEnv = process.env): Array<{ cmd: string; args: string[] }> {
  if (platform === "macos") return [{ cmd: "pbcopy", args: [] }];
  if (platform === "windows") {
    // clip.exe はコードページで日本語が化けるので PowerShell の Set-Clipboard（標準入力を UTF-8 で読む）
    return [
      {
        cmd: "powershell.exe",
        args: [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::InputEncoding=[Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
        ],
      },
    ];
  }
  const wayland = (env.XDG_SESSION_TYPE ?? "").toLowerCase() === "wayland" || !!env.WAYLAND_DISPLAY;
  const x11 = [
    { cmd: "xclip", args: ["-selection", "clipboard"] },
    { cmd: "xsel", args: ["--clipboard", "--input"] },
  ];
  return wayland ? [{ cmd: "wl-copy", args: [] }, ...x11] : x11;
}

/** 指示文をクリップボードへ。最初に通ったコマンドで止める。 */
export async function copyToClipboard(
  text: string,
  platform: FfPlatform,
  run: Spawner = realSpawner,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ ok: boolean; via?: string }> {
  // pbcopy は LANG が無いと UTF-8 を別の符号で受ける
  const childEnv = platform === "macos" ? { ...env, LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" } : env;
  for (const c of clipboardCommands(platform, env)) {
    const r = await run(c.cmd, c.args, text, childEnv);
    if (r.code === 0) return { ok: true, via: c.cmd };
  }
  return { ok: false };
}

/** OpenClaw の Control UI の場所（port と basePath だけ。資格情報は読まない）。 */
export type OpenclawUi = { port: number; basePath: string };

/**
 * port の決め方は docs/gateway/configuration-reference.md の順（`--port` > `OPENCLAW_GATEWAY_PORT` > `gateway.port` > 18789）。
 * 設定ファイルは JSON5 のことがあるので、`gateway` の `port` と `controlUi.basePath` だけを控えめに拾う。
 */
export async function locateOpenclawUi(
  env: NodeJS.ProcessEnv = process.env,
  readText: (p: string) => Promise<string> = (p) => readFile(p, "utf8"),
): Promise<OpenclawUi> {
  let port = 18789;
  let basePath = "";
  const cfgPath = env.OPENCLAW_CONFIG_PATH ?? path.join(env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw"), "openclaw.json");
  try {
    const text = await readText(cfgPath);
    const gw = extractBlock(text, "gateway");
    if (gw) {
      const p = /["']?port["']?\s*:\s*(\d{2,5})/.exec(stripNested(gw));
      if (p) port = Number(p[1]);
      const cu = extractBlock(gw, "controlUi");
      const bp = cu ? /["']?basePath["']?\s*:\s*["']([^"']*)["']/.exec(cu) : null;
      if (bp) basePath = bp[1]!;
    }
  } catch {
    // 設定が無ければ既定
  }
  const envPort = Number(env.OPENCLAW_GATEWAY_PORT);
  if (Number.isInteger(envPort) && envPort > 0 && envPort < 65536) port = envPort;
  basePath = basePath.replace(/\/+$/, "");
  if (basePath && !basePath.startsWith("/")) basePath = `/${basePath}`;
  return { port, basePath };
}

/** `"key": { ... }` の中身（波括弧の対応を数える）。 */
function extractBlock(text: string, key: string): string | null {
  const m = new RegExp(`["']?${key}["']?\\s*:\\s*\\{`).exec(text);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(m.index + m[0].length, i);
    }
  }
  return null;
}

/** 入れ子の {…} を消す（gateway 直下の port だけを見るため）。 */
function stripNested(block: string): string {
  let out = "";
  let depth = 0;
  for (const ch of block) {
    if (ch === "{") depth++;
    if (depth === 0) out += ch;
    if (ch === "}") depth--;
  }
  return out;
}

/** 入力欄に指示文を入れた状態で OpenClaw の会話を開く URL（loopback のみ・トークンなし）。 */
export function openclawDraftUrl(ui: OpenclawUi, text: string, agentId = "main"): string {
  const agent = /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(agentId) ? agentId : "main";
  return `http://127.0.0.1:${ui.port}${ui.basePath}/chat/${encodeURIComponent(agent)}?draft=${encodeURIComponent(text)}`;
}

export function openUrlCommand(platform: FfPlatform, url: string): { cmd: string; args: string[] } {
  if (platform === "macos") return { cmd: "open", args: [url] };
  if (platform === "windows") return { cmd: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] };
  return { cmd: "xdg-open", args: [url] };
}

/** ② OpenClaw の入力欄へ。送信はしない（本人が送信を押す）。 */
export async function sendDraftToOpenclaw(
  text: string,
  platform: FfPlatform,
  opts: { agentId?: string; env?: NodeJS.ProcessEnv; run?: Spawner; readText?: (p: string) => Promise<string> } = {},
): Promise<{ ok: boolean }> {
  const ui = await locateOpenclawUi(opts.env ?? process.env, opts.readText);
  const url = openclawDraftUrl(ui, text, opts.agentId);
  const c = openUrlCommand(platform, url);
  const r = await (opts.run ?? realSpawner)(c.cmd, c.args);
  return { ok: r.code === 0 };
}
