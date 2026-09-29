// NF 右下の丸コマンド登録 — AI アプリのウィンドウの右下に重ねる丸（DK-01〜07）。
import type { Command } from "commander";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

/** 本人に聞く（端末なら y/N、Mac で端末が無ければダイアログ）。答えが無ければ「いいえ」。 */
async function askOwner(message: string): Promise<boolean> {
  if (process.stdin.isTTY) {
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const a = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
      return a === "y" || a === "yes" || a === "はい";
    } finally {
      rl.close();
    }
  }
  if (process.platform === "darwin") {
    const { execFile } = await import("node:child_process");
    const script = `display dialog ${JSON.stringify(message)} buttons {"あとで", "更新する"} default button "あとで" with title "NeuraFusion"`;
    return await new Promise((resolve) => {
      execFile("osascript", ["-e", script], (err, stdout) => resolve(!err && stdout.includes("更新する")));
    });
  }
  if (process.platform === "linux") {
    const { execFile } = await import("node:child_process");
    return await new Promise((resolve) => {
      execFile(
        "zenity",
        ["--question", "--title=NeuraFusion", `--text=${message}`, "--ok-label=更新する", "--cancel-label=あとで"],
        (err) => resolve(!err),
      );
    });
  }
  return false;
}

async function packageVersion(): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
      if (pkg.version && (pkg.name === "neurafusion" || pkg.name === "openclaw")) return pkg.version;
    } catch {
      // 上へ
    }
    dir = path.dirname(dir);
  }
  return "0.0.0";
}

/** overlay サブコマンド群を登録する。 */
export function registerOverlayCommand(program: Command) {
  const overlay = program
    .command("overlay")
    .description("NF 右下の丸: AI アプリ（Claude・ChatGPT・Cursor など）のウィンドウの右下に丸を重ね、押したときだけ答えを読んで検品パネルを開く");

  overlay
    .command("start")
    .description("丸を起動する（Ctrl+C で止める）")
    .option("--no-update-check", "起動時に新しい版を確かめない")
    .action(async (opts: { updateCheck: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { currentPlatform, realHostDeps, resolveNativeBinary, startOverlayHost } = await import("../../overlay/host.js");
        const { loadSettings } = await import("../../overlay/settings.js");
        const platform = currentPlatform();
        if (!platform) throw new Error("右下の丸は macOS・Windows・Linux だけです");
        const settings = await loadSettings();
        if (opts.updateCheck && settings.checkUpdates) {
          const { checkAndMaybeUpdate, realUpdateDeps } = await import("../../overlay/update.js");
          const r = await checkAndMaybeUpdate(await packageVersion(), realUpdateDeps(askOwner));
          if (r.status === "installed") {
            defaultRuntime.log(`更新しました（${r.check.status === "available" ? r.check.latest : ""}）。もう一度 overlay start で起動してください。`);
            return;
          }
          if (r.status === "declined") defaultRuntime.log("更新はあとにしました。");
          if (r.status === "install-failed") defaultRuntime.log(`更新に失敗しました: ${r.why}`);
        }
        const binary = resolveNativeBinary(platform);
        if (!binary) {
          throw new Error(
            platform === "macos"
              ? "丸の本体が見つかりません（apps/nf-overlay-macos で swift build -c release、または NF_OVERLAY_BIN を指定）"
              : platform === "windows"
                ? "丸の本体（Windows）が見つかりません（NF_OVERLAY_BIN を指定）"
                : "丸の本体（Linux）が見つかりません（apps/nf-overlay-linux/nf-overlay、または NF_OVERLAY_BIN を指定）",
          );
        }
        const host = startOverlayHost({ binary, platform, settings, deps: realHostDeps((l) => defaultRuntime.log(l)) });
        const stop = () => host.stop();
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
        const code = await host.exited;
        defaultRuntime.log(`丸を止めました（${code ?? "?"}）`);
      });
    });

  overlay
    .command("apps")
    .description("対応アプリとオン・オフ、読めた・読めないの記録を出す")
    .option("--json", "JSON で出す", false)
    .action(async (opts: { json: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { OVERLAY_APPS, isSupportedOn } = await import("../../overlay/apps.js");
        const { currentPlatform } = await import("../../overlay/host.js");
        const { isEnabled, loadSettings } = await import("../../overlay/settings.js");
        const { loadReadRecords, tallyReads } = await import("../../overlay/reads.js");
        const platform = currentPlatform() ?? "macos";
        const s = await loadSettings();
        const tally = new Map(tallyReads(await loadReadRecords()).map((t) => [t.app, t]));
        const rows = OVERLAY_APPS.map((a) => ({
          id: a.id,
          label: a.label,
          supported: isSupportedOn(a, platform),
          enabled: isEnabled(a, s, platform),
          read: s.read[a.id] ?? a.read,
          verdict: tally.get(a.id)?.verdict ?? "untried",
        }));
        if (opts.json) {
          defaultRuntime.log(JSON.stringify(rows, null, 2));
          return;
        }
        for (const r of rows) {
          const state = !r.supported ? "未対応（識別子を未確認）" : r.enabled ? "オン" : "オフ";
          defaultRuntime.log(`${r.id.padEnd(11)} ${state.padEnd(6)} 読み取り:${r.verdict}  ${r.label}`);
        }
      });
    });

  for (const [name, on] of [["enable", true], ["disable", false]] as const) {
    overlay
      .command(`${name} <id>`)
      .description(on ? "そのアプリで丸を出す" : "そのアプリでは丸を出さない")
      .action(async (id: string) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          const { loadSettings, saveSettings, setEnabled } = await import("../../overlay/settings.js");
          await saveSettings(setEnabled(await loadSettings(), id, on));
          defaultRuntime.log(`${id}: ${on ? "オン" : "オフ"}（起動中の丸には次の起動から効きます）`);
        });
      });
  }

  overlay
    .command("panel-url [url]")
    .description("丸を押したときに開く画面の URL（https か 127.0.0.1 の http）。省略で未接続に戻す")
    .action(async (url?: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { isAllowedPanelUrl, loadSettings, saveSettings } = await import("../../overlay/settings.js");
        const s = await loadSettings();
        if (url && !isAllowedPanelUrl(url)) throw new Error("https か、127.0.0.1・localhost の http だけです");
        const next = { ...s };
        if (url) next.panelUrl = url;
        else delete next.panelUrl;
        await saveSettings(next);
        defaultRuntime.log(url ? `パネル: ${url}` : "パネル: 未接続");
      });
    });

  overlay
    .command("check-update")
    .description("新しい版を確かめ、了承したときだけ更新する")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { checkAndMaybeUpdate, realUpdateDeps } = await import("../../overlay/update.js");
        const r = await checkAndMaybeUpdate(await packageVersion(), realUpdateDeps(askOwner));
        const c = r.check;
        const detail = c.status === "unknown" ? c.why : `今 ${c.current} / 最新 ${c.latest}`;
        defaultRuntime.log(`${r.status}（${detail}）`);
      });
    });
}
