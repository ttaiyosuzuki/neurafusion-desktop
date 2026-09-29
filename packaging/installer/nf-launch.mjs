#!/usr/bin/env node
// NeuraFusion Desktop — 配布形式（DK-09）の共通ランチャー。
//
// .dmg の NeuraFusion.app・Windows のインストーラ・.deb・AppImage のどれも、同梱の Node 24 でこれを動かす。
//   1. 初回だけ: 同梱の npm tarball を、本人のデータの置き場（管理者権限の要らない場所）に入れる
//   2. 同梱の丸の本体（NF_OVERLAY_BIN）を渡して `neurafusion overlay start` を起動する
//      （OS の許可 — Mac のアクセシビリティ等 — は丸の本体が最初の1回だけ聞く）
// 今のデスクトップ版の仕組み（npm tarball を入れる Node CLI ＋ OS ごとの丸の本体）はそのまま。
// 読んだ文字はここを通らない（ログには段階と終了コードだけ書く）。

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @typedef {"macos" | "windows" | "linux"} DistPlatform */
/** @typedef {{ version: string; packageName: string; tgz: string; overlayBin?: string }} DistManifest */

/** @param {string} p @returns {DistPlatform} */
export function distPlatform(p = process.platform) {
  if (p === "darwin") return "macos";
  if (p === "win32") return "windows";
  return "linux";
}

/**
 * 本人のデータの置き場（管理者権限なしで書ける場所）。
 * @param {DistPlatform} platform
 * @param {Record<string, string | undefined>} env
 * @param {string} home
 */
export function dataDir(platform, env = process.env, home = os.homedir()) {
  if (env.NF_DIST_DATA_DIR) return env.NF_DIST_DATA_DIR;
  if (platform === "macos") return path.join(home, "Library", "Application Support", "NeuraFusion");
  if (platform === "windows") {
    const base = env.LOCALAPPDATA || path.win32.join(home, "AppData", "Local");
    return path.win32.join(base, "NeuraFusion");
  }
  return path.join(env.XDG_DATA_HOME || path.join(home, ".local", "share"), "neurafusion");
}

/** CLI を入れる先（版ごと。古い版は残るが、更新時に上書きされない） */
export function cliPrefix(platform, dir, version) {
  return (platform === "windows" ? path.win32 : path).join(dir, "cli", version);
}

/** 同梱の Node の横にある npm-cli.js（公式配布物の配置） */
export function npmCliPath(platform, execPath = process.execPath) {
  if (platform === "windows") return path.win32.join(path.win32.dirname(execPath), "node_modules", "npm", "bin", "npm-cli.js");
  return path.join(path.dirname(execPath), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js");
}

/** `npm install -g --prefix` で入った CLI の入口 */
export function cliEntryPath(platform, prefix, packageName) {
  if (platform === "windows") return path.win32.join(prefix, "node_modules", packageName, "openclaw.mjs");
  return path.join(prefix, "lib", "node_modules", packageName, "openclaw.mjs");
}

/** 入れ直しが要るか（印のファイルに版が書かれていて、入口があれば要らない） */
export function needsInstall(markerText, version, entryExists) {
  return !(entryExists && typeof markerText === "string" && markerText.trim() === version);
}

/** 初回の導入のコマンド（同梱の node で同梱の npm を動かす） */
export function installArgs(npmCli, prefix, tgz) {
  return [npmCli, "install", "-g", "--prefix", prefix, "--no-audit", "--no-fund", "--loglevel", "error", tgz];
}

/**
 * CLI に渡す環境。
 *  - NF_OVERLAY_BIN: 同梱の丸の本体（resolveNativeBinary が最初に見る）
 *  - PATH の先頭に同梱の node・入れた CLI: 自動更新（DK-07）の `npm install -g` も同じ場所に入る
 *  - npm_config_prefix: 同上
 */
export function childEnv(platform, env, { overlayBin, prefix, execPath = process.execPath }) {
  const p = platform === "windows" ? path.win32 : path;
  const sep = platform === "windows" ? ";" : ":";
  const bins = platform === "windows" ? [p.dirname(execPath), prefix] : [p.dirname(execPath), p.join(prefix, "bin")];
  const out = { ...env, npm_config_prefix: prefix, NF_DIST: "1" };
  const key = platform === "windows" ? Object.keys(env).find((k) => k.toLowerCase() === "path") ?? "Path" : "PATH";
  out[key] = [...bins, env[key] ?? ""].filter(Boolean).join(sep);
  if (overlayBin) out.NF_OVERLAY_BIN = overlayBin;
  return out;
}

/** 同梱物の一覧（nf-dist.json）を読む */
export function readManifest(resourcesDir) {
  const m = /** @type {DistManifest} */ (JSON.parse(readFileSync(path.join(resourcesDir, "nf-dist.json"), "utf8")));
  if (!m.version || !m.packageName || !m.tgz) throw new Error("nf-dist.json が壊れています");
  return m;
}

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, opts);
    child.on("error", () => resolve(127));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** Mac で端末が無いとき（Finder から開いたとき）の知らせ。文字は固定文だけ。 */
function notify(platform, message) {
  if (platform === "macos" && !process.stdout.isTTY) {
    spawn("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "NeuraFusion"`], { stdio: "ignore" }).on("error", () => {});
  }
  process.stderr.write(`${message}\n`);
}

export async function main({ resourcesDir, argv = process.argv.slice(2) }) {
  const platform = distPlatform();
  const manifest = readManifest(resourcesDir);
  const dir = dataDir(platform);
  const prefix = cliPrefix(platform, dir, manifest.version);
  const entry = cliEntryPath(platform, prefix, manifest.packageName);
  const marker = path.join(prefix, ".nf-installed");
  mkdirSync(dir, { recursive: true });
  const log = (line) => appendFileSync(path.join(dir, "launcher.log"), `${new Date().toISOString()} ${line}\n`);

  let markerText = null;
  try {
    markerText = readFileSync(marker, "utf8");
  } catch {
    markerText = null;
  }
  if (needsInstall(markerText, manifest.version, existsSync(entry)) || argv.includes("--reinstall")) {
    notify(platform, "初回の準備をしています（数分かかります。次からはすぐ開きます）");
    mkdirSync(prefix, { recursive: true });
    const code = await run(process.execPath, installArgs(npmCliPath(platform), prefix, path.join(resourcesDir, manifest.tgz)), {
      stdio: ["ignore", "inherit", "inherit"],
      env: childEnv(platform, process.env, { prefix }),
    });
    log(`install v${manifest.version} exit=${code}`);
    if (code !== 0 || !existsSync(entry)) {
      notify(platform, "準備に失敗しました。インターネットにつながっているか確かめて、もう一度開いてください");
      return code || 1;
    }
    writeFileSync(marker, `${manifest.version}\n`);
  }
  if (argv.includes("--install-only")) return 0;

  const overlayBin = manifest.overlayBin ? path.join(resourcesDir, manifest.overlayBin) : undefined;
  const cliArgs = argv.filter((a) => a !== "--reinstall");
  const args = cliArgs.length > 0 ? cliArgs : ["overlay", "start"];
  log(`start ${args[0] ?? ""} ${args[1] ?? ""}`);
  const code = await run(process.execPath, [entry, ...args], {
    stdio: "inherit",
    env: childEnv(platform, process.env, { overlayBin: overlayBin && existsSync(overlayBin) ? overlayBin : undefined, prefix }),
  });
  log(`exit=${code}`);
  return code;
}

/** 直接起動されたか（/var と /private/var のようなシンボリックリンク越しでも同じと見る） */
export function isDirectRun(argv1, selfPath) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(selfPath);
  } catch {
    return path.resolve(argv1) === selfPath;
  }
}

const self = fileURLToPath(import.meta.url);
if (isDirectRun(process.argv[1], self)) {
  const resourcesDir = process.env.NF_DIST_RESOURCES || path.dirname(self);
  main({ resourcesDir }).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`NeuraFusion: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
