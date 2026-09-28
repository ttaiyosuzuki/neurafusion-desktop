// NF 検品コマンド登録 — どのアプリでも使える入口（選択文字→パネル）。
import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

/** kensan サブコマンド群を登録する。 */
export function registerKensanCommand(program: Command) {
  const kensan = program
    .command("kensan")
    .description(
      "NF 検品: 選んだ文字だけを取り込んで、税理士53業務の判定・必須項目・検算をローカルのパネルに出す",
    );

  kensan
    .command("panel")
    .description("選択文字（または --from-clipboard でコピー済みの文字）を検品パネルで開く")
    .option("--text <text>", "取り込む文字を直接渡す（選択文字の代わり）")
    .option("--text-file <path>", "取り込む文字をファイルで渡す")
    .option("--from-clipboard", "「コピーしてから押す」方式（クリップボードだけを読む）", false)
    .option("--no-open", "ブラウザで開かず、生成した HTML のパスだけ出す")
    .option("--json", "結果を JSON で出す", false)
    .action(async (opts: { text?: string; textFile?: string; fromClipboard: boolean; open: boolean; json: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { runKensanPanel } = await import("../../kensan/runner.js");
        let selectionText = opts.text;
        if (!selectionText && opts.textFile) {
          const { readFile } = await import("node:fs/promises");
          selectionText = await readFile(opts.textFile, "utf8");
        }
        const result = await runKensanPanel({
          selectionText,
          fromClipboard: opts.fromClipboard,
          open: opts.open,
        });
        if (opts.json) {
          defaultRuntime.log(
            JSON.stringify(
              {
                htmlPath: result.htmlPath,
                mode: result.capture.mode,
                chars: result.capture.text.length,
                truncated: result.capture.truncated,
                task: { id: result.detect.id, name: result.detect.name, hits: result.detect.hits },
                recordCount: result.recordCount,
              },
              null,
              2,
            ),
          );
        } else {
          defaultRuntime.log(
            `${result.detect.name}（一致 ${result.detect.hits}・${result.capture.mode === "selection" ? "選択" : "コピー"} ${result.capture.text.length}字） -> ${result.htmlPath}`,
          );
        }
      });
    });

  kensan
    .command("handle-stdin", { hidden: true })
    .description("macOS の Quick Action から選択文字を受け取る内部入口")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { readAllStdin, runKensanPanel } = await import("../../kensan/runner.js");
        const selectionText = await readAllStdin();
        await runKensanPanel({ selectionText, open: true });
      });
    });

  kensan
    .command("install-entry")
    .description("全体入口を入れる（macOS: サービス⌘⇧9 ／ Windows: スタートメニューの Ctrl+Shift+9）")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (process.platform === "darwin") {
          const { installMacEntry } = await import("../../kensan/entry-macos.js");
          const r = await installMacEntry();
          defaultRuntime.log(`入れました: ${r.workflowPath}`);
          defaultRuntime.log(`ショートカット: ${r.keyEquivalent}（文字を選んで押すとパネルが出ます）`);
          defaultRuntime.log(
            "効かないアプリでは、初回に macOS がアクセシビリティの許可を1回だけ確認します。許可しない場合は「コピーしてから押す」方式に切り替わります。",
          );
        } else if (process.platform === "win32") {
          const { installWindowsEntry } = await import("../../kensan/entry-windows.js");
          const r = await installWindowsEntry();
          defaultRuntime.log(`入れました: ${r.lnkPath}（${r.hotkey}・コピーしてから押す方式）`);
        } else {
          defaultRuntime.log(
            "このOSでは自動登録できません。お使いのデスクトップ環境で「neurafusion kensan panel --from-clipboard」を Ctrl+Shift+9 に割り当ててください。",
          );
        }
      });
    });

  kensan
    .command("uninstall-entry")
    .description("全体入口を外す")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (process.platform === "darwin") {
          const { uninstallMacEntry } = await import("../../kensan/entry-macos.js");
          await uninstallMacEntry();
          defaultRuntime.log("外しました（サービスとショートカット）。");
        } else if (process.platform === "win32") {
          const { uninstallWindowsEntry } = await import("../../kensan/entry-windows.js");
          await uninstallWindowsEntry();
          defaultRuntime.log("外しました。");
        } else {
          defaultRuntime.log("このOSでは登録が無いので、何もしていません。");
        }
      });
    });
}
