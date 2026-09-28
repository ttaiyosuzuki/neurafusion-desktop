// NF 検品 — 実機依存の実装（クリップボード・⌘C合成・状態ファイル）。
// capture.ts はこの実装を差し替え可能な形で受け取る（テストは偽物を注入する）。

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { AxNotAuthorizedError, type CaptureDeps, type KensanState } from "./capture.js";

const execFileAsync = promisify(execFile);

/** 状態・記録の置き場（gateway の設定とは独立した小さなディレクトリ）。 */
export function kensanStateDir(): string {
  return path.join(os.homedir(), ".neurafusion", "kensan");
}

export function kensanStatePath(): string {
  return path.join(kensanStateDir(), "state.json");
}

export function kensanRecordsPath(): string {
  return path.join(kensanStateDir(), "records.json");
}

async function readClipboardReal(): Promise<string> {
  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync("pbpaste", [], { maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  }
  if (process.platform === "win32") {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-Command", "Get-Clipboard -Raw"],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout;
  }
  // Linux: xclip があれば使う。無ければ空（コピー方式の案内だけ出る）。
  try {
    const { stdout } = await execFileAsync("xclip", ["-selection", "clipboard", "-o"], {
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return "";
  }
}

async function writeClipboardReal(text: string): Promise<void> {
  if (process.platform === "darwin") {
    await new Promise<void>((resolve, reject) => {
      const child = execFile("pbcopy", [], (err) => (err ? reject(err) : resolve()));
      child.stdin?.end(text);
    });
    return;
  }
  // 他OSでは退避復元を行わない（⌘C合成をしないため呼ばれない）。
}

/** ⌘C を合成する。アクセシビリティ不許可のときは AxNotAuthorizedError。 */
async function simulateCopyReal(): Promise<void> {
  try {
    await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to keystroke "c" using command down',
    ]);
  } catch (err) {
    const msg = String((err as { stderr?: string; message?: string }).stderr ?? "") +
      String((err as Error).message ?? "");
    // 1002 = errAEEventNotPermitted（補助アクセス不許可）の典型。
    if (/1002|not allowed|assistive|osascript is not allowed|アクセシビリティ/i.test(msg)) {
      throw new AxNotAuthorizedError(msg);
    }
    throw err;
  }
}

async function loadStateReal(): Promise<KensanState> {
  try {
    const raw = await readFile(kensanStatePath(), "utf8");
    return JSON.parse(raw) as KensanState;
  } catch {
    return {};
  }
}

async function saveStateReal(state: KensanState): Promise<void> {
  await mkdir(kensanStateDir(), { recursive: true });
  await writeFile(kensanStatePath(), JSON.stringify(state, null, 2), "utf8");
}

export function realCaptureDeps(): CaptureDeps {
  return {
    platform: process.platform,
    readClipboard: readClipboardReal,
    writeClipboard: writeClipboardReal,
    simulateCopy: simulateCopyReal,
    delay: (ms) => new Promise((r) => setTimeout(r, ms)),
    loadState: loadStateReal,
    saveState: saveStateReal,
  };
}
