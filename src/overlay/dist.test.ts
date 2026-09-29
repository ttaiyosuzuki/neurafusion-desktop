// TS-38（配布形式・DK-09）: .dmg・Windows のインストーラ・.deb・AppImage が共通で使うランチャーと、
// 3 OS の組み立ての約束（同梱物・許可の文言・管理者権限なし・Linux の依存）を確かめる。
// 実物の書き出し・中身の確認は scripts/nf-dist/verify-installers.sh（docs/desktop-installers.md）。

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — 同梱用の素の .mjs（型なし）
import * as launcher from "../../packaging/installer/nf-launch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LAUNCHER = path.join(ROOT, "packaging", "installer", "nf-launch.mjs");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("ランチャーの置き場（管理者権限なし）", () => {
  it("OS ごとの本人のデータの置き場", () => {
    expect(launcher.dataDir("macos", {}, "/Users/a")).toBe("/Users/a/Library/Application Support/NeuraFusion");
    expect(launcher.dataDir("windows", { LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" }, "C:\\Users\\a")).toBe(
      "C:\\Users\\a\\AppData\\Local\\NeuraFusion",
    );
    expect(launcher.dataDir("linux", {}, "/home/a")).toBe("/home/a/.local/share/neurafusion");
    expect(launcher.dataDir("linux", { XDG_DATA_HOME: "/x" }, "/home/a")).toBe("/x/neurafusion");
  });

  it("同梱の npm と、入れた CLI の入口（公式配布物の配置）", () => {
    expect(launcher.npmCliPath("macos", "/R/node/bin/node")).toBe("/R/node/lib/node_modules/npm/bin/npm-cli.js");
    expect(launcher.npmCliPath("windows", "C:\\P\\node\\node.exe")).toBe("C:\\P\\node\\node_modules\\npm\\bin\\npm-cli.js");
    expect(launcher.cliEntryPath("linux", "/d/cli/1", "neurafusion")).toBe("/d/cli/1/lib/node_modules/neurafusion/openclaw.mjs");
    expect(launcher.cliEntryPath("windows", "C:\\d\\cli\\1", "neurafusion")).toBe("C:\\d\\cli\\1\\node_modules\\neurafusion\\openclaw.mjs");
  });

  it("入れ直しは、版が変わったか入口が無いときだけ", () => {
    expect(launcher.needsInstall(null, "1", false)).toBe(true);
    expect(launcher.needsInstall("1\n", "1", true)).toBe(false);
    expect(launcher.needsInstall("0\n", "1", true)).toBe(true);
    expect(launcher.needsInstall("1\n", "1", false)).toBe(true);
  });

  it("CLI に丸の本体と同梱の node を渡す（自動更新も同じ置き場に入る）", () => {
    const env = launcher.childEnv("linux", { PATH: "/usr/bin" }, { overlayBin: "/o/nf-overlay", prefix: "/d/cli/1", execPath: "/R/node/bin/node" });
    expect(env.NF_OVERLAY_BIN).toBe("/o/nf-overlay");
    expect(env.npm_config_prefix).toBe("/d/cli/1");
    expect(env.PATH).toBe("/R/node/bin:/d/cli/1/bin:/usr/bin");
    const win = launcher.childEnv("windows", { Path: "C:\\W" }, { prefix: "C:\\d", execPath: "C:\\P\\node\\node.exe" });
    expect(win.Path).toBe("C:\\P\\node;C:\\d;C:\\W");
    expect(win.NF_OVERLAY_BIN).toBeUndefined();
  });
});

describe("ランチャーを実際に動かす（偽の小さな tarball）", () => {
  it("初回だけ入れ、2回目は入れずに overlay start を丸の本体つきで起動する", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "nf-dist-"));
    // 偽の本体: 受け取った引数と NF_OVERLAY_BIN を書き出すだけ
    const pkgDir = path.join(tmp, "pkg");
    mkdirSync(pkgDir);
    writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "neurafusion", version: "9.9.9", bin: { neurafusion: "openclaw.mjs" } }),
    );
    writeFileSync(
      path.join(pkgDir, "openclaw.mjs"),
      `import { appendFileSync } from "node:fs";\nappendFileSync(process.env.NF_TEST_OUT, JSON.stringify({ args: process.argv.slice(2), bin: process.env.NF_OVERLAY_BIN ?? null }) + "\\n");\n`,
    );
    const res = path.join(tmp, "res");
    mkdirSync(path.join(res, "overlay"), { recursive: true });
    const npmCli = launcher.npmCliPath(launcher.distPlatform(), process.execPath);
    const packed = spawnSync(process.execPath, [npmCli, "pack", pkgDir, "--pack-destination", res, "--silent"], { encoding: "utf8" });
    expect(packed.status).toBe(0);
    writeFileSync(path.join(res, "overlay", "nf-overlay"), "");
    writeFileSync(
      path.join(res, "nf-dist.json"),
      JSON.stringify({ version: "9.9.9", packageName: "neurafusion", tgz: "neurafusion-9.9.9.tgz", overlayBin: "overlay/nf-overlay" }),
    );
    const data = path.join(tmp, "data");
    const out = path.join(tmp, "out.jsonl");
    const env = { ...process.env, NF_DIST_RESOURCES: res, NF_DIST_DATA_DIR: data, NF_TEST_OUT: out, npm_config_cache: path.join(tmp, "cache"), npm_config_offline: "true" };
    const run = () => spawnSync(process.execPath, [LAUNCHER], { env, encoding: "utf8" });

    const first = run();
    expect(first.status).toBe(0);
    expect(first.stderr).toContain("初回の準備");
    const second = run();
    expect(second.status).toBe(0);
    expect(second.stderr).not.toContain("初回の準備");

    const calls = readFileSync(out, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ args: ["overlay", "start"], bin: path.join(res, "overlay", "nf-overlay") });
    expect(readFileSync(path.join(data, "cli", "9.9.9", ".nf-installed"), "utf8").trim()).toBe("9.9.9");
    const log = readFileSync(path.join(data, "launcher.log"), "utf8");
    expect(log.match(/install v9\.9\.9 exit=0/g)).toHaveLength(1);
  }, 120_000);
});

describe("3 OS の組み立ての約束", () => {
  it("Mac: 入口の .app は Dock に出さず、アクセシビリティの理由を書き、同梱の node で動く", () => {
    const plist = read("packaging/installer/macos/Info.plist");
    expect(plist).toContain("<key>LSUIElement</key><true/>");
    expect(plist).toContain("NSAccessibilityUsageDescription");
    expect(read("packaging/installer/macos/NeuraFusion")).toContain('"$R/node/bin/node" "$R/nf-launch.mjs"');
    const dmg = read("scripts/nf-dist/build-macos-dmg.sh");
    expect(dmg).toMatch(/hdiutil create .*-format UDZO/);
    expect(dmg).toContain("NFOverlay.app/Contents/MacOS/nf-overlay");
  });

  it("Windows: 管理者権限なしで本人の領域に入れ、入れる途中で初回の準備をし、丸の本体を自己完結で同梱する", () => {
    const nsi = read("packaging/installer/windows/neurafusion.nsi");
    expect(nsi).toContain("RequestExecutionLevel user");
    expect(nsi).toContain('InstallDir "$LOCALAPPDATA\\Programs\\NeuraFusion"');
    expect(nsi).toContain("nf-launch.mjs\" --install-only");
    expect(nsi).not.toMatch(/HKLM/);
    const sh = read("scripts/nf-dist/build-windows-installer.sh");
    expect(sh).toContain("--self-contained true");
    expect(sh).toContain('"overlay/nf-overlay.exe"');
  });

  it("Linux: .deb は DK-08 の README の実行時の依存を Depends に持ち、AppImage は同じランチャーで動く", () => {
    const sh = read("scripts/nf-dist/build-linux-packages.sh");
    for (const dep of ["python3-gi", "gir1.2-gtk-3.0", "gir1.2-wnck-3.0", "gir1.2-atspi-2.0", "tesseract-ocr-jpn"]) {
      expect(sh).toContain(dep);
    }
    expect(sh).toContain("dpkg-deb --root-owner-group");
    expect(sh).toContain('"$HERE/opt/neurafusion/node/bin/node" "$HERE/opt/neurafusion/nf-launch.mjs"');
  });

  it("同梱の Node は公式配布物を SHA-256 で照らしてから使う", () => {
    const sh = read("scripts/nf-dist/fetch-node.sh");
    expect(sh).toContain("SHASUMS256.txt");
    expect(sh).toMatch(/NODE_VERSION="\$\{NF_NODE_VERSION:-v24\./);
  });

  it("成果物はリポジトリの外（.artifacts/ は ignore 下）", () => {
    expect(read("scripts/nf-dist/common.sh")).toContain('OUT_DIR="$ROOT_DIR/.artifacts/installers"');
    expect(existsSync(path.join(ROOT, ".gitignore")) && read(".gitignore")).toMatch(/^\.artifacts\/$/m);
  });
});
