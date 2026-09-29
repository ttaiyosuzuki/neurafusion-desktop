// NF 右下の丸 — ネイティブの丸のプロセスの起動と停止（DK-01/04/05）。
// ネイティブへ config を渡し、返ってくる行を記録・パネルへの受け渡しに振り分ける。
// ログに出すのは文字数だけ（read の本文は redactForLog で落とす）。

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { OverlayPlatform } from "./apps.js";
import { encodeInbound, parseNativeLine, redactForLog, type NativeMessage, type OverlayConfigMessage } from "./protocol.js";
import { appendReadRecord, decidePanelText, toReadRecord } from "./reads.js";
import { buildConfigMessage, type OverlaySettings } from "./settings.js";

export type OverlayHostDeps = {
  spawnNative: (binary: string) => Pick<ChildProcess, "stdin" | "stdout" | "stderr" | "on" | "kill">;
  appendRecord: typeof appendReadRecord;
  log: (line: string) => void;
  now: () => Date;
};

export type OverlayHostHandle = {
  config: OverlayConfigMessage;
  /** 設定を変えたら送り直す（DK-05 のオン・オフは再起動なしで効く） */
  reconfigure: (s: OverlaySettings) => void;
  stop: () => void;
  /** ネイティブが終わったら解決（終了コード） */
  exited: Promise<number | null>;
  /** 受け取ったもの（テストと status 用。本文は入らない） */
  seen: NativeMessage[];
};

export function currentPlatform(): OverlayPlatform | null {
  if (process.platform === "darwin") return "macos";
  if (process.platform === "win32") return "windows";
  return null;
}

/**
 * ネイティブの丸の置き場。
 *  - NF_OVERLAY_BIN があればそれ
 *  - Mac: apps/nf-overlay-macos/.build/{release,debug}/nf-overlay（開発時。配布の形は docs/overlay-macos-release.md）
 */
export function resolveNativeBinary(platform: OverlayPlatform, env = process.env): string | null {
  if (env.NF_OVERLAY_BIN) return existsSync(env.NF_OVERLAY_BIN) ? env.NF_OVERLAY_BIN : null;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const roots = [path.resolve(here, "..", ".."), path.resolve(here, "..")];
  const candidates: string[] = [];
  for (const root of roots) {
    if (platform === "macos") {
      candidates.push(
        path.join(root, "apps", "nf-overlay-macos", "NFOverlay.app", "Contents", "MacOS", "nf-overlay"),
        path.join(root, "apps", "nf-overlay-macos", ".build", "release", "nf-overlay"),
        path.join(root, "apps", "nf-overlay-macos", ".build", "debug", "nf-overlay"),
      );
    } else {
      candidates.push(path.join(root, "apps", "nf-overlay-windows", "nf-overlay.exe"));
    }
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

export function realHostDeps(log: (line: string) => void): OverlayHostDeps {
  return {
    spawnNative: (binary) => spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] }),
    appendRecord: appendReadRecord,
    log,
    now: () => new Date(),
  };
}

export function startOverlayHost(opts: {
  binary: string;
  platform: OverlayPlatform;
  settings: OverlaySettings;
  deps: OverlayHostDeps;
}): OverlayHostHandle {
  const { deps, platform } = opts;
  let settings = opts.settings;
  let config = buildConfigMessage(settings, platform);
  const child = deps.spawnNative(opts.binary);
  const seen: NativeMessage[] = [];

  const send = (line: string) => {
    child.stdin?.write(line);
  };

  const onMessage = async (msg: NativeMessage) => {
    seen.push(redactForLog(msg));
    switch (msg.type) {
      case "ready":
        deps.log(`丸を起動しました（アクセシビリティ: ${msg.ax ? "許可あり" : "未許可"}・画面収録: ${msg.screen ? "許可あり" : "未許可"}）`);
        break;
      case "read": {
        let masked: number | undefined;
        if (msg.ok && typeof msg.text === "string") {
          const d = decidePanelText(msg.text, settings, config);
          // 渡さないときは何も送らない（パネルはネイティブ側で文字数だけ示す）
          if (d.send) {
            masked = d.masked;
            send(encodeInbound({ v: 1, type: "panel-text", text: d.text }));
          }
        }
        await deps.appendRecord(toReadRecord(msg, platform, deps.now(), masked));
        deps.log(`読み取り: ${msg.app} ${msg.method} ${msg.ok ? "読めた" : `読めない（${msg.reason ?? "不明"}）`} ${msg.chars}字`);
        break;
      }
      case "error":
        deps.log(`丸のエラー: ${msg.code}`);
        break;
      default:
        break;
    }
  };

  if (child.stdout) {
    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const msg = parseNativeLine(line);
      if (msg) void onMessage(msg);
    });
  }
  child.stderr?.on("data", () => {
    // 診断は捨てる（本文は出さない約束だが、念のため画面・記録に流さない）
  });

  const exited = new Promise<number | null>((resolve) => {
    child.on("exit", (code: number | null) => resolve(code));
    child.on("error", () => resolve(null));
  });

  send(encodeInbound(config));

  return {
    get config() {
      return config;
    },
    reconfigure(s) {
      settings = s;
      config = buildConfigMessage(s, platform);
      send(encodeInbound(config));
    },
    stop() {
      send(encodeInbound({ v: 1, type: "stop" }));
      child.stdin?.end();
      setTimeout(() => child.kill(), 2000).unref();
    },
    exited,
    seen,
  };
}
