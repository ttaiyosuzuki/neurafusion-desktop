// TS-38（配布形式・DK-09）: .dmg・Windows のインストーラ・.deb・AppImage が共通で使うランチャーと、
// 3 OS の組み立ての約束（同梱物・許可の文言・管理者権限なし・Linux の依存）を確かめる。
// 実物の書き出し・中身の確認は scripts/nf-dist/verify-installers.sh（docs/desktop-installers.md）。

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — 同梱用の素の .mjs（型なし）
import * as launcher from "../../packaging/installer/nf-launch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const LAUNCHER_SRC = path.join(ROOT, "packaging", "installer", "nf-launch.mjs");
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

describe("直接起動の判定", () => {
  it("シンボリックリンク越し（/var → /private/var など）でも自分と見る", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "nf-dist-link-"));
    const real = path.join(tmp, "real.mjs");
    writeFileSync(real, "");
    const link = path.join(tmp, "link.mjs");
    symlinkSync(real, link);
    expect(launcher.isDirectRun(link, realpathSync(real))).toBe(true);
    expect(launcher.isDirectRun(undefined, real)).toBe(false);
    expect(launcher.isDirectRun(path.join(tmp, "other.mjs"), real)).toBe(false);
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
    // 同梱と同じく、リソースの置き場にあるランチャーを（リンクを含むかもしれない）そのパスで動かす
    copyFileSync(LAUNCHER_SRC, path.join(res, "nf-launch.mjs"));
    const run = () => spawnSync(process.execPath, [path.join(res, "nf-launch.mjs")], { env, encoding: "utf8" });

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
    for (const dep of ["python3-gi", "python3-gi-cairo", "gir1.2-gtk-3.0", "gir1.2-wnck-3.0", "gir1.2-atspi-2.0", "tesseract-ocr-jpn"]) {
      expect(sh).toContain(dep);
    }
    expect(sh).toContain("dpkg-deb --root-owner-group");
    expect(sh).toContain('"$HERE/opt/neurafusion/node/bin/node" "$HERE/opt/neurafusion/nf-launch.mjs"');
  });

  it.skipIf(process.platform === "linux")("Linux 版は Linux の上でだけ作る（Mac では組み立て前に止まる）", () => {
    const r = spawnSync("bash", [path.join(ROOT, "scripts/nf-dist/build-linux-packages.sh")], { encoding: "utf8" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Linux（x86_64）の上で作ります");
    expect(existsSync(path.join(ROOT, ".artifacts/installers-stage/linux-deb"))).toBe(false);
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

// scripts/nf-dist を一時フォルダに写し、そこをリポジトリの根として動かす（本物の .artifacts には触れない）
function scratchRoot(version = "9.9.9") {
  const root = mkdtempSync(path.join(os.tmpdir(), "nf-dist-root-"));
  cpSync(path.join(ROOT, "scripts", "nf-dist"), path.join(root, "scripts", "nf-dist"), { recursive: true });
  cpSync(path.join(ROOT, "packaging", "installer"), path.join(root, "packaging", "installer"), { recursive: true });
  for (const f of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md"]) copyFileSync(path.join(ROOT, f), path.join(root, f));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "neurafusion", version }));
  return root;
}

// 偽の小さな本体の tarball。withAi=false が npm pack で作った物（bundleDependencies の @openclaw/ai が抜けた形）
function fakeTgz(root: string, sub: string, opts: { withAi: boolean; mtime: number; version?: string }) {
  const stage = mkdtempSync(path.join(os.tmpdir(), "nf-dist-pkg-"));
  mkdirSync(path.join(stage, "package"), { recursive: true });
  writeFileSync(path.join(stage, "package", "package.json"), JSON.stringify({ name: "neurafusion", version: opts.version ?? "9.9.9" }));
  if (opts.withAi) {
    mkdirSync(path.join(stage, "package", "node_modules", "@openclaw", "ai"), { recursive: true });
    writeFileSync(path.join(stage, "package", "node_modules", "@openclaw", "ai", "package.json"), '{"name":"@openclaw/ai"}');
  }
  const dir = path.join(root, ".artifacts", sub);
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `neurafusion-${opts.version ?? "9.9.9"}.tgz`);
  expect(spawnSync("tar", ["-czf", out, "-C", stage, "package"]).status).toBe(0);
  utimesSync(out, opts.mtime, opts.mtime);
  return out;
}

function requireTgz(root: string, env: Record<string, string | undefined> = {}) {
  const { NF_DIST_TGZ: _drop, ...base } = process.env;
  const r = spawnSync(
    "bash",
    ["-c", 'set -euo pipefail; source "$1/scripts/nf-dist/common.sh"; require_tgz; echo "TGZ=$TGZ"', "_", root],
    { encoding: "utf8", env: { ...base, ...env } },
  );
  return { status: r.status, tgz: /^TGZ=(.*)$/m.exec(r.stdout)?.[1] ?? null, stderr: r.stderr };
}

describe("本体の tarball を自動で選ぶ（@openclaw/ai を同梱した物だけ）", () => {
  const T0 = Date.parse("2026-09-29T09:00:00Z") / 1000;

  it("@openclaw/ai の入っていない候補しか無ければ、配布物を作る前に非 0 で止まり、理由を出す", () => {
    const root = scratchRoot();
    fakeTgz(root, "docker-e2e-package", { withAi: false, mtime: T0 });
    const r = requireTgz(root);
    expect(r.status).not.toBe(0);
    expect(r.tgz).toBeNull();
    expect(r.stderr).toContain("使わない（@openclaw/ai が入っていない）");
    expect(r.stderr).toContain("配布物は作りません");
    expect(r.stderr).toContain("build-tgz.sh");
    // 組み立ての入口も同じところで止まり、置き場を作らない
    const build = spawnSync("bash", [path.join(root, "scripts", "nf-dist", "build-windows-installer.sh")], { encoding: "utf8" });
    expect(build.status).not.toBe(0);
    expect(existsSync(path.join(root, ".artifacts", "installers-stage", "windows"))).toBe(false);
  });

  it("候補が 1 つも無くても止まる", () => {
    const r = requireTgz(scratchRoot());
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("配布物は作りません");
  });

  it("新しいが @openclaw/ai の抜けた方より、古くても入っている方を選ぶ", () => {
    const root = scratchRoot();
    const good = fakeTgz(root, "dk9-pack", { withAi: true, mtime: T0 });
    const bad = fakeTgz(root, "docker-e2e-package", { withAi: false, mtime: T0 + 600 });
    const r = requireTgz(root);
    expect(r.status).toBe(0);
    expect(r.tgz).toBe(good);
    expect(r.stderr).toContain(`使わない（@openclaw/ai が入っていない）: ${bad}`);
  });

  it("入っている物が複数あれば一番新しい物。版の違う tarball は候補にしない", () => {
    const root = scratchRoot();
    fakeTgz(root, "dk9-pack", { withAi: true, mtime: T0 });
    const newer = fakeTgz(root, "nf-dist-pack", { withAi: true, mtime: T0 + 60 });
    fakeTgz(root, "old-pack", { withAi: true, mtime: T0 + 120, version: "9.9.8" });
    expect(requireTgz(root).tgz).toBe(newer);
  });

  it("NF_DIST_TGZ に @openclaw/ai の抜けた方を指定すると、入っている候補があっても止まる", () => {
    const root = scratchRoot();
    fakeTgz(root, "dk9-pack", { withAi: true, mtime: T0 });
    const bad = fakeTgz(root, "docker-e2e-package", { withAi: false, mtime: T0 - 60 });
    const r = requireTgz(root, { NF_DIST_TGZ: bad });
    expect(r.status).not.toBe(0);
    expect(r.tgz).toBeNull();
    expect(r.stderr).toContain("NF_DIST_TGZ の tarball に @openclaw/ai が入っていません");
  });

  it("NF_DIST_TGZ に入っている方を指定すれば、それを使う（無いファイル・壊れた物は止まる）", () => {
    const root = scratchRoot();
    const good = fakeTgz(root, "elsewhere", { withAi: true, mtime: T0 - 600 });
    fakeTgz(root, "nf-dist-pack", { withAi: true, mtime: T0 });
    expect(requireTgz(root, { NF_DIST_TGZ: good }).tgz).toBe(good);
    expect(requireTgz(root, { NF_DIST_TGZ: path.join(root, "missing.tgz") }).status).not.toBe(0);
    const broken = path.join(root, "broken.tgz");
    writeFileSync(broken, "not a tarball");
    expect(requireTgz(root, { NF_DIST_TGZ: broken }).status).not.toBe(0);
  });

  it("tarball を作る段は --pnpm-pack（npm pack だと @openclaw/ai が抜ける）で、出来た物も同じ検査にかける", () => {
    const sh = read("scripts/nf-dist/build-tgz.sh");
    expect(sh).toMatch(/package-openclaw-for-docker\.mjs"[^\n]*\\\n[^\n]*--pnpm-pack/);
    expect(sh).toContain("tgz_has_ai_runtime");
    expect(read("docs/desktop-installers.md")).toContain("bash scripts/nf-dist/build-tgz.sh");
  });
});

describe("ライセンス文書を配布物に入れる", () => {
  function staged(kind: "macos" | "windows" | "linux" | "appimage") {
    const root = scratchRoot();
    const dir = path.join(root, "stage");
    mkdirSync(path.join(dir, "node"), { recursive: true });
    writeFileSync(path.join(dir, "node", "LICENSE"), "Node.js is licensed for use as follows:\n(偽の Node の LICENSE)\n");
    const r = spawnSync(
      "bash",
      ["-c", 'set -euo pipefail; source "$1/scripts/nf-dist/common.sh"; stage_licenses "$2" "$3"; finish_licenses "$2" "Node.js v24.0.0"', "_", root, dir, kind],
      { encoding: "utf8" },
    );
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    return { dir, all: readFileSync(path.join(dir, "licenses", "ALL.txt"), "utf8"), index: readFileSync(path.join(dir, "licenses", "README.txt"), "utf8") };
  }

  it("上流の LICENSE 全文（著作権表示・許諾文・末尾の1行）を、指している THIRD_PARTY_NOTICES.md と並べて置く", () => {
    const { dir, all } = staged("macos");
    expect(readFileSync(path.join(dir, "LICENSE"), "utf8")).toBe(read("LICENSE"));
    expect(readFileSync(path.join(dir, "NOTICE"), "utf8")).toBe(read("NOTICE"));
    expect(readFileSync(path.join(dir, "THIRD_PARTY_NOTICES.md"), "utf8")).toBe(read("THIRD_PARTY_NOTICES.md"));
    expect(read("LICENSE")).toContain("Copyright (c) 2026 OpenClaw Foundation");
    expect(read("LICENSE")).toContain("Permission is hereby granted, free of charge");
    expect(read("LICENSE")).toMatch(/Third-party notices for incorporated or adapted code are recorded in\s+THIRD_PARTY_NOTICES\.md\./);
    for (const s of ["Copyright (c) 2026 OpenClaw Foundation", "Permission is hereby granted, free of charge", "Node.js is licensed for use as follows", "Mario Zechner"]) {
      expect(all).toContain(s);
    }
  });

  it("OS ごとの部品のライセンス（Windows は NSIS、AppImage は runtime）と一覧。ALL.txt は自分を含まない", () => {
    const win = staged("windows");
    expect(readdirSync(path.join(win.dir, "licenses")).sort()).toEqual(["ALL.txt", "README.txt", "dotnet-library-license.txt", "node-LICENSE.txt", "nsis-COPYING.txt"]);
    expect(win.index).toContain("dotnet-library-license.txt: Microsoft .NET Library License");
    expect(win.all).toContain("MICROSOFT .NET LIBRARY");
    expect(win.all).toContain("Common Public License");
    expect(win.index).toContain("nsis-COPYING.txt: NSIS 3");
    expect(win.index).toContain("Node.js v24.0.0");
    expect(win.all.match(/==== licenses\/README\.txt ====/g)).toHaveLength(1);
    expect(win.all).not.toContain("==== licenses/ALL.txt ====");
    const img = staged("appimage");
    expect(img.all).toContain("The AppImage runtime executable contains statically linked code");
    expect(img.index).toContain("libfuse（LGPL-2.1）");
    expect(readdirSync(path.join(staged("linux").dir, "licenses")).sort()).toEqual(["ALL.txt", "README.txt", "node-LICENSE.txt"]);
  });

  it("同梱物の権限を組み立てた人の umask に左右させない（600 の作業ツリーから写しても、ほかの利用者が読める）", () => {
    const root = scratchRoot();
    const dir = path.join(root, "stage");
    mkdirSync(path.join(dir, "bin"), { recursive: true });
    writeFileSync(path.join(dir, "a.txt"), "a", { mode: 0o600 });
    writeFileSync(path.join(dir, "bin", "run"), "#!/bin/sh\n", { mode: 0o700 });
    const r = spawnSync("bash", ["-c", 'source "$1/scripts/nf-dist/common.sh"; normalize_modes "$2"', "_", root, dir]);
    expect(r.status).toBe(0);
    const mode = (p: string) => spawnSync("stat", process.platform === "darwin" ? ["-f", "%Lp", p] : ["-c", "%a", p], { encoding: "utf8" }).stdout.trim();
    expect(mode(path.join(dir, "a.txt"))).toBe("644");
    expect(mode(path.join(dir, "bin", "run"))).toBe("755");
    const dmg = read("scripts/nf-dist/build-macos-dmg.sh");
    expect(dmg.indexOf('normalize_modes "$APP"')).toBeGreaterThan(0);
    expect(dmg.indexOf('normalize_modes "$APP"')).toBeLessThan(dmg.indexOf('codesign --force --sign "$SIGN" "$APP"'));
    expect(read("scripts/nf-dist/build-linux-packages.sh")).toContain('normalize_modes "$appdir"');
  });

  it("各配布物に入れる: .dmg は .app の中と開いた窓、Windows はインストール先（.NET・WebView2 も）、.deb は /usr/share/doc/<pkg>/copyright", () => {
    const dmg = read("scripts/nf-dist/build-macos-dmg.sh");
    expect(dmg).toContain('stage_licenses "$RES" macos');
    expect(dmg).toContain('licenses/ALL.txt" "$DMG_SRC/ライセンス.txt"');
    const win = read("scripts/nf-dist/build-windows-installer.sh");
    expect(win).toContain('stage_licenses "$STAGE" windows');
    for (const f of ["dotnet-runtime-LICENSE.txt", "dotnet-runtime-THIRD-PARTY-NOTICES.txt", "dotnet-windowsdesktop-LICENSE.txt", "webview2-LICENSE.txt", "webview2-NOTICE.txt"]) {
      expect(win).toContain(f);
    }
    expect(read("packaging/installer/windows/neurafusion.nsi")).toContain('File /r "${STAGE}\\*.*"');
    expect(read("packaging/installer/windows/neurafusion.nsi")).toContain('!insertmacro MUI_PAGE_LICENSE "${LICENSE_PAGE}"');
    expect(win).toContain("dotnet-license-page-header.txt");
    expect(win).toContain('"-DLICENSE_PAGE=$LICENSE_PAGE"');
    const csproj = read("apps/nf-overlay-windows/src/NfOverlay.Win/NfOverlay.Win.csproj");
    for (const f of ["wpfgfx_cor3.dll", "D3DCompiler_47_cor3.dll", "vcruntime140_cor3.dll", "PenImc_cor3.dll"]) expect(csproj).toContain(f);
    expect(csproj).toContain("<Copyright>Copyright (c) 2026 NeuraFusion</Copyright>");
    const linux = read("scripts/nf-dist/build-linux-packages.sh");
    expect(linux).toContain("usr/share/doc/neurafusion-desktop/copyright");
    expect(linux).toContain('stage_payload "$appdir/opt/neurafusion" appimage');
  });
});

describe("verify-installers.sh はロケールに左右されず、止まってもマウントを残さない", () => {
  it("全角文字のすぐ前に $変数 を書かない（macOS の bash は UTF-8 のロケールで先頭バイトを変数名に含める）", () => {
    const dir = path.join(ROOT, "scripts", "nf-dist");
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".sh"))) {
      readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7f]/.test(line)) bad.push(`${f}:${i + 1}`);
        });
    }
    expect(bad).toEqual([]);
  });

  it("先頭でロケールを C に固定し、EXIT・INT・TERM・ERR を trap する", () => {
    const sh = read("scripts/nf-dist/verify-installers.sh");
    expect(sh.indexOf("export LC_ALL=C")).toBeGreaterThan(0);
    expect(sh.indexOf("export LC_ALL=C")).toBeLessThan(sh.indexOf('source "$HERE/common.sh"'));
    for (const sig of ["EXIT", "INT", "TERM", "ERR"]) expect(sh).toMatch(new RegExp(`^trap .* ${sig}$`, "m"));
    expect(sh).toContain("hdiutil detach -quiet -force");
    expect(sh).toContain('MOUNTS+=("$mnt")');
  });

  it("ja_JP.UTF-8 でも C でも同じ結果（配布物の無い置き場で動かす）", () => {
    const root = scratchRoot();
    const run = (locale: string) =>
      spawnSync("bash", [path.join(root, "scripts", "nf-dist", "verify-installers.sh"), "dmg", "exe", "deb", "appimage"], {
        encoding: "utf8",
        env: { ...process.env, LC_ALL: locale, LANG: locale },
      });
    const ja = run("ja_JP.UTF-8");
    const c = run("C");
    expect(ja.stdout).toBe(c.stdout);
    expect(ja.status).toBe(1);
    expect(c.status).toBe(1);
    expect(ja.stdout).toContain("ok 0 / NG 4");
    expect(ja.stderr).not.toContain("unbound variable");
  });

  it.skipIf(spawnSync("python3", ["--version"]).status !== 0)("名前の検査は上流の名前・旧名・ロブスターを UTF-8 と UTF-16LE で見つける", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "nf-brand-"));
    const scan = (name: string, data: Buffer) => {
      writeFileSync(path.join(dir, name), data);
      return spawnSync("python3", [path.join(ROOT, "scripts", "nf-dist", "brand-scan.py"), path.join(dir, name)], { encoding: "utf8" }).status;
    };
    expect(scan("ok.txt", Buffer.from("NeuraFusion 2026.9.6 — やりたいことを、一文で。\n"))).toBe(0);
    expect(scan("utf8.txt", Buffer.from("Usage: openclaw [options]\n"))).toBe(1);
    expect(scan("utf16.bin", Buffer.from("x\u0000ProductName OpenClaw", "utf16le"))).toBe(1);
    expect(scan("lobster.txt", Buffer.from("🦞\n"))).toBe(1);
    expect(scan("old.txt", Buffer.from("Clawdbot\n"))).toBe(1);
  });

  it("利用者に見える所の元（Info.plist・NSIS・はじめにお読みください・.desktop）に上流の名前が無い", () => {
    for (const f of [
      "packaging/installer/macos/Info.plist",
      "packaging/installer/macos/NFOverlay-Info.plist",
      "packaging/installer/macos/NeuraFusion",
      "packaging/installer/windows/neurafusion.nsi",
      "packaging/installer/はじめにお読みください.txt",
    ]) {
      expect(read(f), f).not.toMatch(/openclaw|clawdbot|moltbot|clawd|clawhub|🦞/i);
    }
    const desktop = /\[Desktop Entry\][\s\S]*?EOF/.exec(read("scripts/nf-dist/build-linux-packages.sh"))?.[0] ?? "";
    expect(desktop).toContain("Name=NeuraFusion");
    expect(desktop).not.toMatch(/openclaw/i);
  });
});

describe("CLI の --help と管理画面の名前・アイコン（NeuraFusion）", () => {
  const brandScan = (args: string[]) =>
    spawnSync("python3", [path.join(ROOT, "scripts", "nf-dist", "brand-scan.py"), ...args], { encoding: "utf8" });

  it.skipIf(spawnSync("python3", ["--version"]).status !== 0)("--help の検査は理由つきの許可リストの名前だけを許す", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "nf-brand-allow-"));
    const allow = path.join(ROOT, "scripts", "nf-dist", "brand-allow-help.json");
    const help = (name: string, text: string) => {
      writeFileSync(path.join(dir, name), text);
      return path.join(dir, name);
    };
    const allowedOnly = help(
      "allowed.txt",
      "Usage: neurafusion [options] [command]\n  --dev  state under ~/.openclaw-dev (env OPENCLAW_CONTAINER)\n" +
        "  promos *  offers from ClawHub\nDocs: https://docs.openclaw.ai/cli\n",
    );
    const ok = brandScan(["--allow", allow, allowedOnly]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toMatch(/^許可 4 件/);
    expect(brandScan(["--allow", allow, help("product.txt", "  plugins *  Manage OpenClaw plugins\n")]).status).toBe(1);
    expect(brandScan(["--allow", allow, help("usage.txt", "Usage: openclaw [options] [command]\n")]).status).toBe(1);
    expect(brandScan(["--allow", allow, help("lobster.txt", "NeuraFusion 🦞\n")]).status).toBe(1);
    // 許可リストが無ければ、許可リストの名前も見つける（許可は --help の検査だけ）
    expect(brandScan([allowedOnly]).status).toBe(1);
    const noReason = path.join(dir, "no-reason.json");
    writeFileSync(noReason, JSON.stringify({ allow: [{ name: "x", pattern: "OpenClaw", reason: " " }] }));
    expect(brandScan(["--allow", noReason, allowedOnly]).status).toBe(2);
  });

  it("管理画面のアイコンは packaging/installer/icons の NeuraFusion の物と同じ・題名とアプリの名前は NeuraFusion", () => {
    for (const [ui, icon] of [
      ["favicon.svg", "neurafusion.svg"],
      ["favicon.ico", "neurafusion.ico"],
      ["favicon-32.png", "neurafusion-32.png"],
      ["apple-touch-icon.png", "neurafusion-180.png"],
    ]) {
      const a = readFileSync(path.join(ROOT, "ui", "public", ui));
      expect(a.equals(readFileSync(path.join(ROOT, "packaging", "installer", "icons", icon))), ui).toBe(true);
    }
    expect(read("ui/public/favicon.svg")).not.toMatch(/lobster|openclaw/i);
    expect(read("ui/index.html")).toContain("<title>NeuraFusion Control</title>");
    const manifest = JSON.parse(read("ui/public/manifest.webmanifest")) as { name: string; short_name: string };
    expect([manifest.name, manifest.short_name]).toEqual(["NeuraFusion Control", "NeuraFusion"]);
    const sh = read("scripts/nf-dist/verify-installers.sh");
    expect(sh.match(/^  control_ui_is_ours "/gm)).toHaveLength(4);
    expect(sh).toContain('no_brand_allowed "$name: --help に許可リスト以外の上流の名前が無い" "$d/help.out"');
  });
});
