// NF 検品 — Windows の全体入口。
// ネイティブ常駐なしで確実に効くのは「ショートカットファイルのホットキー」
// （スタートメニュー配下の .lnk は Hotkey を持てる）。押されたら
// 「コピーしてから押す」方式（クリップボード読み取り）でパネルを出す。
// ※この端末は macOS のため、この経路は未実測（実装のみ）。

import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { cliEntryPath } from "./entry-macos.js";

const execFileAsync = promisify(execFile);

export type WindowsEntryInstallResult = { lnkPath: string; hotkey: string };

export async function installWindowsEntry(): Promise<WindowsEntryInstallResult> {
  const nodePath = process.execPath;
  const cliPath = cliEntryPath();
  const appData = process.env.APPDATA ?? "";
  if (!appData) throw new Error("APPDATA が見つかりません");
  const lnkPath = path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "NFで検品.lnk");
  const script = [
    "$W = New-Object -ComObject WScript.Shell;",
    `$S = $W.CreateShortcut('${lnkPath.replaceAll("'", "''")}');`,
    `$S.TargetPath = '${nodePath.replaceAll("'", "''")}';`,
    `$S.Arguments = '"${cliPath.replaceAll("'", "''")}" kensan panel --from-clipboard';`,
    "$S.Hotkey = 'Ctrl+Shift+9';",
    "$S.Save();",
  ].join(" ");
  await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script]);
  return { lnkPath, hotkey: "Ctrl+Shift+9" };
}

export async function uninstallWindowsEntry(): Promise<void> {
  const appData = process.env.APPDATA ?? "";
  if (!appData) return;
  const lnkPath = path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "NFで検品.lnk");
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Remove-Item -LiteralPath '${lnkPath.replaceAll("'", "''")}' -ErrorAction SilentlyContinue`,
  ]).catch(() => {});
}
