// NF 検品 — macOS の全体入口（Quick Action ＝ サービス）。
//
// なぜサービス方式か:
//   - 配布物は Node CLI のみ（ネイティブバイナリ0件）で、常駐のキーフックを持てない。
//   - macOS のサービスは「選択中の文字」だけを OS が渡してくる＝読み取り範囲が
//     仕組みとして選択文字に限定される（常時監視も他画面の読み取りも構造的に不可能）。
//   - ⌘⇧9 は pbs（サービスのショートカット設定）で割り当てる。
// 選択が取れない場面（サービス非対応アプリ）では capture.ts 側の
// ⌘C 合成（初回に1回だけ OS がアクセシビリティ確認）→ コピー方式へ切替が効く。

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SERVICE_NAME = "NFで検品";
const PBS_KEY = `(null) - ${SERVICE_NAME} - runWorkflowAsService`;
// @=⌘ $=⇧ → ⌘⇧9
const KEY_EQUIVALENT = "@$9";

export function serviceWorkflowPath(): string {
  return path.join(os.homedir(), "Library", "Services", `${SERVICE_NAME}.workflow`);
}

/** この CLI 自身（openclaw.mjs）の絶対パス。src/ と dist/ のどちらから見ても3つ上が根。 */
export function cliEntryPath(): string {
  return fileURLToPath(new URL("../../../openclaw.mjs", import.meta.url));
}

function infoPlist(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>${SERVICE_NAME}</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSRequiredContext</key>
      <dict/>
      <key>NSSendTypes</key>
      <array>
        <string>NSStringPboardType</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
`;
}

function documentWflow(nodePath: string, cliPath: string): string {
  // 「シェルスクリプトを実行」1個だけの Quick Action。入力は stdin で受け取る。
  const command = `exec "${nodePath}" "${cliPath}" kensan handle-stdin`;
  const escapedCommand = command
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key>
  <string>528</string>
  <key>AMApplicationVersion</key>
  <string>2.10</string>
  <key>AMDocumentVersion</key>
  <string>2</string>
  <key>actions</key>
  <array>
    <dict>
      <key>action</key>
      <dict>
        <key>AMAccepts</key>
        <dict>
          <key>Container</key>
          <string>List</string>
          <key>Optional</key>
          <true/>
          <key>Types</key>
          <array>
            <string>com.apple.cocoa.string</string>
          </array>
        </dict>
        <key>AMActionVersion</key>
        <string>2.0.3</string>
        <key>AMParameterProperties</key>
        <dict>
          <key>COMMAND_STRING</key>
          <dict/>
          <key>CheckedForUserDefaultShell</key>
          <dict/>
          <key>inputMethod</key>
          <dict/>
          <key>shell</key>
          <dict/>
          <key>source</key>
          <dict/>
        </dict>
        <key>AMProvides</key>
        <dict>
          <key>Container</key>
          <string>List</string>
          <key>Types</key>
          <array>
            <string>com.apple.cocoa.string</string>
          </array>
        </dict>
        <key>ActionBundlePath</key>
        <string>/System/Library/Automator/Run Shell Script.action</string>
        <key>ActionName</key>
        <string>シェルスクリプトを実行</string>
        <key>ActionParameters</key>
        <dict>
          <key>COMMAND_STRING</key>
          <string>${escapedCommand}</string>
          <key>CheckedForUserDefaultShell</key>
          <true/>
          <key>inputMethod</key>
          <integer>0</integer>
          <key>shell</key>
          <string>/bin/zsh</string>
          <key>source</key>
          <string></string>
        </dict>
        <key>BundleIdentifier</key>
        <string>com.apple.RunShellScript</string>
        <key>CFBundleVersion</key>
        <string>2.0.3</string>
        <key>CanShowSelectedItemsWhenRun</key>
        <false/>
        <key>CanShowWhenRun</key>
        <true/>
        <key>Class Name</key>
        <string>RunShellScriptAction</string>
        <key>InputUUID</key>
        <string>6E9A5C60-0000-4F1B-9C2A-000000000001</string>
        <key>Keywords</key>
        <array>
          <string>シェル</string>
        </array>
        <key>OutputUUID</key>
        <string>6E9A5C60-0000-4F1B-9C2A-000000000002</string>
        <key>UUID</key>
        <string>6E9A5C60-0000-4F1B-9C2A-000000000003</string>
        <key>UnlocalizedApplications</key>
        <array>
          <string>Automator</string>
        </array>
        <key>arguments</key>
        <dict>
          <key>0</key>
          <dict>
            <key>default value</key>
            <integer>0</integer>
            <key>name</key>
            <string>inputMethod</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>0</string>
          </dict>
        </dict>
        <key>isViewVisible</key>
        <integer>1</integer>
        <key>location</key>
        <string>309.000000:253.000000</string>
        <key>nibPath</key>
        <string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
      </dict>
      <key>isViewVisible</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>connectors</key>
  <dict/>
  <key>workflowMetaData</key>
  <dict>
    <key>applicationBundleIDsByPath</key>
    <dict/>
    <key>applicationPaths</key>
    <array/>
    <key>inputTypeIdentifier</key>
    <string>com.apple.Automator.text</string>
    <key>outputTypeIdentifier</key>
    <string>com.apple.Automator.nothing</string>
    <key>presentationMode</key>
    <integer>11</integer>
    <key>processesInput</key>
    <integer>0</integer>
    <key>serviceInputTypeIdentifier</key>
    <string>com.apple.Automator.text</string>
    <key>serviceOutputTypeIdentifier</key>
    <string>com.apple.Automator.nothing</string>
    <key>serviceProcessesInput</key>
    <integer>0</integer>
    <key>systemImageName</key>
    <string>NSTouchBarMarketplaceTemplate</string>
    <key>useAutomaticInputType</key>
    <integer>0</integer>
    <key>workflowTypeIdentifier</key>
    <string>com.apple.Automator.servicesMenu</string>
  </dict>
</dict>
</plist>
`;
}

export type MacEntryInstallResult = {
  workflowPath: string;
  keyEquivalent: string;
  nodePath: string;
  cliPath: string;
};

/** Quick Action を書き、⌘⇧9 を割り当て、pbs に反映する。 */
export async function installMacEntry(): Promise<MacEntryInstallResult> {
  const nodePath = process.execPath;
  const cliPath = cliEntryPath();
  const wf = serviceWorkflowPath();
  await mkdir(path.join(wf, "Contents"), { recursive: true });
  await writeFile(path.join(wf, "Contents", "Info.plist"), infoPlist(), "utf8");
  await writeFile(path.join(wf, "Contents", "document.wflow"), documentWflow(nodePath, cliPath), "utf8");

  // ショートカット ⌘⇧9 を割り当てる（サービス設定の既定の置き場）。
  // 注意: キーが "(" で始まるため、リテラルの二重引用符で包まないと defaults が
  // plist の配列として誤解析する（Could not parse ... Try single-quoting it）。
  await execFileAsync("defaults", [
    "write",
    "pbs",
    "NSServicesStatus",
    "-dict-add",
    `"${PBS_KEY}"`,
    `{ enabled_context_menu = 1; enabled_services_menu = 1; key_equivalent = "${KEY_EQUIVALENT}"; }`,
  ]);
  // サービス台帳を更新（失敗しても致命ではない: ログイン時に再走査される）。
  await execFileAsync("/System/Library/CoreServices/pbs", ["-update"]).catch(() => {});
  return { workflowPath: wf, keyEquivalent: "⌘⇧9", nodePath, cliPath };
}

export async function uninstallMacEntry(): Promise<void> {
  await rm(serviceWorkflowPath(), { recursive: true, force: true });
  const plist = path.join(os.homedir(), "Library", "Preferences", "pbs.plist");
  await execFileAsync("/usr/libexec/PlistBuddy", [
    "-c",
    `Delete :NSServicesStatus:${PBS_KEY.replaceAll(":", "\\:")}`,
    plist,
  ]).catch(() => {});
  await execFileAsync("/System/Library/CoreServices/pbs", ["-update"]).catch(() => {});
}
