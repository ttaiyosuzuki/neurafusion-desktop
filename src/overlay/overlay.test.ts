// NF 右下の丸（Node 側）の自動テスト — DK-01/02/04/05/07・TS-38 の Node 分:
//   対応アプリの一覧（確かめた識別子だけ）・オン・オフ（既定は対応アプリだけオン）・config の形・
//   約束の1行の読み書き・「読めた・読めない」の記録（本文を残さない）・パネルへの受け渡し（SB-01 と同じ）・
//   ネイティブのプロセスとのやりとり（偽物のプロセス）・自動更新は了承なしに入れ替えない。

import { EventEmitter } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { OVERLAY_APPS, findOverlayApp, isSupportedOn } from "./apps.js";
import { startOverlayHost, type OverlayHostDeps } from "./host.js";
import { encodeInbound, parseNativeLine, redactForLog, type NativeMessage } from "./protocol.js";
import { appendReadRecord, decidePanelText, loadReadRecords, tallyReads, toReadRecord } from "./reads.js";
import {
  DEFAULT_SETTINGS,
  buildConfigMessage,
  isAllowedPanelUrl,
  isEnabled,
  loadSettings,
  normalizeSettings,
  saveSettings,
  setEnabled,
} from "./settings.js";
import { checkAndMaybeUpdate, compareVersions, parseRelease, type UpdateDeps } from "./update.js";

const settings = () => normalizeSettings(undefined);

describe("対応アプリの一覧", () => {
  it("Tier 1 の id だけで、識別子には出どころがある", () => {
    for (const a of OVERLAY_APPS) {
      expect(a.tier).toBe(1);
      if (a.mac.length > 0) expect(a.source.mac).toMatch(/defaults read/);
      if (a.win.length > 0) expect(a.source.win).toBeTruthy();
    }
    const ids = OVERLAY_APPS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("Mac で確かめた識別子があるのは Claude・ChatGPT・Cursor・Notion", () => {
    const mac = OVERLAY_APPS.filter((a) => isSupportedOn(a, "macos")).map((a) => a.id);
    expect(mac.sort()).toEqual(["chatgpt", "claude", "cursor", "notion"]);
    expect(findOverlayApp("claude")?.mac).toEqual(["com.anthropic.claudefordesktop"]);
  });
});

describe("オン・オフ（DK-05）", () => {
  it("既定は対応アプリだけオン、識別子の無いアプリは出ない", () => {
    const s = settings();
    expect(isEnabled(findOverlayApp("claude")!, s, "macos")).toBe(true);
    expect(isEnabled(findOverlayApp("perplexity")!, s, "macos")).toBe(false);
    const cfg = buildConfigMessage(s, "macos");
    expect(cfg.apps.map((a) => a.id).sort()).toEqual(["chatgpt", "claude", "cursor", "notion"]);
    expect(cfg.apps.every((a) => a.enabled)).toBe(true);
  });

  it("オフにしたアプリは config で enabled:false になる", () => {
    const s = setEnabled(settings(), "cursor", false);
    const cfg = buildConfigMessage(s, "macos");
    expect(cfg.apps.find((a) => a.id === "cursor")?.enabled).toBe(false);
    expect(cfg.apps.find((a) => a.id === "claude")?.enabled).toBe(true);
    expect(() => setEnabled(settings(), "nope", true)).toThrow();
  });

  it("識別子の無いアプリはオンにしても出ない", () => {
    const s = setEnabled(settings(), "perplexity", true);
    expect(isEnabled(findOverlayApp("perplexity")!, s, "macos")).toBe(false);
  });

  it("保存と読み込み（壊れた値は捨てる）", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nf-overlay-"));
    expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS);
    await saveSettings(setEnabled(settings(), "notion", false), dir);
    expect((await loadSettings(dir)).enabled).toEqual({ notion: false });
    const n = normalizeSettings({ enabled: { a: "yes", b: false }, read: { c: "bogus", d: "ax-only" }, panelUrl: "http://evil.example/" });
    expect(n.enabled).toEqual({ b: false });
    expect(n.read).toEqual({ d: "ax-only" });
    expect(n.panelUrl).toBeUndefined();
  });

  it("パネルの URL が無ければ未接続、手元の http か https だけ", () => {
    expect(buildConfigMessage(settings(), "macos").panelMode).toBe("disconnected");
    const s = { ...settings(), panelUrl: "http://127.0.0.1:8787/panel" };
    expect(buildConfigMessage(s, "macos")).toMatchObject({ panelMode: "url", panelUrl: "http://127.0.0.1:8787/panel" });
    expect(isAllowedPanelUrl("http://192.168.0.2/")).toBe(false);
    expect(isAllowedPanelUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedPanelUrl("https://example.com/p")).toBe(true);
  });

  it("画面を撮る同意は毎回", () => {
    expect(buildConfigMessage(settings(), "macos").ocrConsent).toBe("ask-each-time");
  });
});

describe("約束（JSON 1行）", () => {
  it("ネイティブの行を読む・知らない行は読み飛ばす", () => {
    expect(parseNativeLine('{"v":1,"type":"clicked","app":"claude"}')).toEqual({ v: 1, type: "clicked", app: "claude" });
    expect(parseNativeLine('{"v":1,"type":"future"}')).toBeNull();
    expect(parseNativeLine("garbage")).toBeNull();
    expect(parseNativeLine("")).toBeNull();
  });

  it("Swift 側が出す形をそのまま読める", () => {
    // apps/nf-overlay-macos の encodeOutbound（sortedKeys）と同じ並び
    const line =
      '{"app":"claude","dot":{"h":44,"w":44,"x":840,"y":640},"type":"geometry","v":1,"window":{"h":600,"w":800,"x":100,"y":100}}';
    expect(parseNativeLine(line)).toMatchObject({ type: "geometry", dot: { x: 840, y: 640 } });
  });

  it("ログ用の形から本文を落とす", () => {
    const m = { v: 1, type: "read", app: "claude", method: "ax", ok: true, chars: 3, text: "秘密" } as NativeMessage;
    expect(JSON.stringify(redactForLog(m))).not.toContain("秘密");
    expect(encodeInbound({ v: 1, type: "stop" })).toBe('{"v":1,"type":"stop"}\n');
  });
});

describe("読めた・読めないの記録（DK-02）", () => {
  it("記録に本文は残らない・アプリごとに集計できる", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nf-overlay-"));
    const file = path.join(dir, "reads.json");
    const t0 = new Date("2026-09-29T08:00:00Z");
    await appendReadRecord(
      toReadRecord({ v: 1, type: "read", app: "claude", method: "ax", ok: true, chars: 12, text: "答えの本文 090-1234-5678" }, "macos", t0),
      file,
    );
    await appendReadRecord(toReadRecord({ v: 1, type: "read", app: "cursor", method: "none", ok: false, chars: 0, reason: "consent-declined" }, "macos", t0), file);
    await appendReadRecord(toReadRecord({ v: 1, type: "read", app: "chatgpt", method: "ocr", ok: true, chars: 40 }, "macos", t0), file);
    const raw = await readFile(file, "utf8");
    expect(raw).not.toContain("答えの本文");
    expect(raw).not.toContain("090");
    const tally = tallyReads(await loadReadRecords(file));
    expect(tally.map((t) => [t.app, t.verdict])).toEqual([
      ["chatgpt", "ocr"],
      ["claude", "ax"],
      ["cursor", "unreadable"],
    ]);
    expect(tally.find((t) => t.app === "cursor")?.lastReason).toBe("consent-declined");
  });
});

describe("パネルへの受け渡し（DK-04/05・SB-01 と同じ）", () => {
  it("未接続なら本文を渡さない", () => {
    expect(decidePanelText("x", settings(), { panelMode: "disconnected" })).toEqual({ send: false, why: "disconnected" });
  });

  it("手元の画面には PII を伏せて渡す", () => {
    const d = decidePanelText("連絡は taro@example.com へ", settings(), { panelMode: "url", panelUrl: "http://127.0.0.1:8787/" });
    expect(d).toMatchObject({ send: true, masked: 1 });
    expect(d.send && d.text).not.toContain("taro@example.com");
  });

  it("外の画面には本人の同意があるときだけ", () => {
    const cfg = { panelMode: "url" as const, panelUrl: "https://example.com/panel" };
    expect(decidePanelText("x", settings(), cfg)).toEqual({ send: false, why: "no-consent" });
    expect(decidePanelText("x", { ...settings(), sendTextToPanel: true }, cfg)).toMatchObject({ send: true });
  });
});

function fakeChild() {
  const ee = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill: () => boolean };
  ee.stdin = new PassThrough();
  ee.stdout = new PassThrough();
  ee.stderr = new PassThrough();
  ee.kill = () => {
    ee.emit("exit", 0);
    return true;
  };
  return ee;
}

describe("ネイティブのプロセスとのやりとり（偽物）", () => {
  it("起動で config を送り、read を記録し、手元の画面には伏せた本文を返す", async () => {
    const child = fakeChild();
    const written: string[] = [];
    child.stdin.on("data", (b: Buffer) => written.push(...b.toString("utf8").split("\n").filter(Boolean)));
    const records: unknown[] = [];
    const logs: string[] = [];
    const deps: OverlayHostDeps = {
      spawnNative: () => child as never,
      appendRecord: async (r) => {
        records.push(r);
        return records.length;
      },
      log: (l) => logs.push(l),
      now: () => new Date("2026-09-29T08:00:00Z"),
    };
    const h = startOverlayHost({
      binary: "/fake",
      platform: "macos",
      settings: { ...settings(), panelUrl: "http://127.0.0.1:8787/" },
      deps,
    });
    await new Promise((r) => setImmediate(r));
    expect(JSON.parse(written[0]!)).toMatchObject({ type: "config", panelMode: "url" });

    child.stdout.write('{"v":1,"type":"ready","platform":"macos","ax":true,"screen":false}\n');
    child.stdout.write('{"v":1,"type":"clicked","app":"claude"}\n');
    child.stdout.write('{"v":1,"type":"read","app":"claude","method":"ax","ok":true,"chars":20,"text":"電話 03-1234-5678 まで"}\n');
    await new Promise((r) => setTimeout(r, 20));

    const panel = written.map((l) => JSON.parse(l)).find((m) => m.type === "panel-text");
    expect(panel.text).toContain("[電話伏せ字]");
    expect(records).toEqual([{ at: "2026-09-29T08:00:00.000Z", platform: "macos", app: "claude", method: "ax", ok: true, chars: 20, masked: 1 }]);
    expect(logs.join("\n")).not.toContain("03-1234-5678");
    expect(JSON.stringify(h.seen)).not.toContain("03-1234-5678");

    // オン・オフの切り替えは送り直すだけ
    h.reconfigure(setEnabled(settings(), "claude", false));
    await new Promise((r) => setImmediate(r));
    const last = JSON.parse(written[written.length - 1]!);
    expect(last.apps.find((a: { id: string }) => a.id === "claude").enabled).toBe(false);

    h.stop();
    await new Promise((r) => setImmediate(r));
    expect(written.some((l) => JSON.parse(l).type === "stop")).toBe(true);
  });

  it("未接続のときは本文を送り返さない", async () => {
    const child = fakeChild();
    const written: string[] = [];
    child.stdin.on("data", (b: Buffer) => written.push(...b.toString("utf8").split("\n").filter(Boolean)));
    startOverlayHost({
      binary: "/fake",
      platform: "macos",
      settings: settings(),
      deps: { spawnNative: () => child as never, appendRecord: async () => 1, log: () => {}, now: () => new Date() },
    });
    child.stdout.write('{"v":1,"type":"read","app":"claude","method":"ocr","ok":true,"chars":5,"text":"abcde"}\n');
    await new Promise((r) => setTimeout(r, 20));
    expect(written.some((l) => JSON.parse(l).type === "panel-text")).toBe(false);
  });
});

describe("Windows（dk-win）の行を受ける", () => {
  it("ready の uia・geometry の scale と px・read の uia と uia- の理由を読み、記録する", async () => {
    const child = fakeChild();
    const records: unknown[] = [];
    const logs: string[] = [];
    startOverlayHost({
      binary: "/fake",
      platform: "windows",
      settings: settings(),
      deps: {
        spawnNative: () => child as never,
        appendRecord: async (r) => {
          records.push(r);
          return records.length;
        },
        log: (l) => logs.push(l),
        now: () => new Date("2026-09-29T08:00:00Z"),
      },
    });
    child.stdout.write('{"v":1,"type":"ready","platform":"windows","uia":true,"screen":true,"version":"0.1.0"}\n');
    const geo =
      '{"v":1,"type":"geometry","app":"claude","window":{"x":0,"y":0,"w":800,"h":600},"dot":{"x":740,"y":540,"w":44,"h":44},"scale":1.5,"px":{"window":{"x":0,"y":0,"w":1200,"h":900},"dot":{"x":1110,"y":810,"w":66,"h":66}}}';
    expect(parseNativeLine(geo)).toMatchObject({ type: "geometry", scale: 1.5, px: { dot: { w: 66 } } });
    child.stdout.write('{"v":1,"type":"read","app":"claude","method":"uia","ok":true,"chars":3,"text":"abc"}\n');
    child.stdout.write('{"v":1,"type":"read","app":"chatgpt","method":"uia","ok":false,"chars":0,"reason":"uia-empty"}\n');
    await new Promise((r) => setTimeout(r, 20));
    expect(logs[0]).toContain("UI Automation: 使える");
    expect(records).toMatchObject([
      { platform: "windows", app: "claude", method: "uia", ok: true },
      { platform: "windows", app: "chatgpt", method: "uia", ok: false, reason: "uia-empty" },
    ]);
    const t = tallyReads(records as never);
    expect(t.find((x) => x.app === "claude")?.verdict).toBe("uia");
    expect(t.find((x) => x.app === "chatgpt")).toMatchObject({ verdict: "unreadable", lastReason: "uia-empty" });
  });
});

describe("Linux（dk-linux・DK-08）の行を受ける", () => {
  const custom = [
    { ...OVERLAY_APPS[0]!, linux: ["nf-fake-ai"], source: { linux: "テスト用" } },
    { ...OVERLAY_APPS[1]!, linux: [] },
  ];

  it("config に WM_CLASS を載せ、確かめた識別子が無いアプリは載せない", () => {
    for (const a of OVERLAY_APPS) if (a.linux.length > 0) expect(a.source.linux).toBeTruthy();
    expect(isSupportedOn(custom[0]!, "linux")).toBe(true);
    expect(isSupportedOn(custom[1]!, "linux")).toBe(false);
    const c = buildConfigMessage(settings(), "linux", custom);
    expect(c.apps.map((a) => a.id)).toEqual([custom[0]!.id]);
    expect(c.apps[0]).toMatchObject({ linux: ["nf-fake-ai"], enabled: true, read: "ax-then-ocr" });
    const off = buildConfigMessage(setEnabled(settings(), custom[0]!.id, false), "linux", custom);
    expect(off.apps[0]!.enabled).toBe(false);
  });

  it("ready の session・Wayland の固定の geometry・atspi の read を読み、本文は記録に残さない", async () => {
    const child = fakeChild();
    const written: string[] = [];
    child.stdin.on("data", (b: Buffer) => written.push(...b.toString("utf8").split("\n").filter(Boolean)));
    const records: unknown[] = [];
    const logs: string[] = [];
    const h = startOverlayHost({
      binary: "/fake",
      platform: "linux",
      settings: { ...settings(), panelUrl: "http://127.0.0.1:8787/" },
      deps: {
        spawnNative: () => child as never,
        appendRecord: async (r) => {
          records.push(r);
          return records.length;
        },
        log: (l) => logs.push(l),
        now: () => new Date("2026-09-29T08:00:00Z"),
      },
    });
    await new Promise((r) => setImmediate(r));
    expect(JSON.parse(written[0]!)).toMatchObject({ type: "config", panelMode: "url" });
    child.stdout.write('{"v":1,"type":"ready","platform":"linux","session":"wayland","ax":false,"screen":true,"ocr":true,"version":"0.1.0"}\n');
    const geo =
      '{"v":1,"type":"geometry","app":"*","window":{"x":0,"y":32,"w":1920,"h":1048},"dot":{"x":1860,"y":1020,"w":44,"h":44},"scale":1.0,"px":{"window":{"x":0,"y":32,"w":1920,"h":1048},"dot":{"x":1860,"y":1020,"w":44,"h":44}},"fixed":true}';
    expect(parseNativeLine(geo)).toMatchObject({ type: "geometry", app: "*", fixed: true });
    child.stdout.write('{"v":1,"type":"read","app":"claude","method":"atspi","ok":true,"chars":22,"text":"電話 03-1234-5678 の答え","attempts":[{"method":"atspi","ok":true,"chars":22}]}\n');
    child.stdout.write('{"v":1,"type":"read","app":"*","method":"none","ok":false,"chars":0,"reason":"screen-denied","attempts":[{"method":"ocr","ok":false,"chars":0,"reason":"screen-denied"}]}\n');
    child.stdout.write('{"v":1,"type":"read","app":"chatgpt","method":"none","ok":false,"chars":0,"reason":"atspi-empty"}\n');
    await new Promise((r) => setTimeout(r, 20));
    expect(logs[0]).toContain("Wayland: 画面の右下に固定");
    const panel = written.map((l) => JSON.parse(l)).find((m) => m.type === "panel-text");
    expect(panel.text).toContain("[電話伏せ字]");
    expect(records).toMatchObject([
      { platform: "linux", app: "claude", method: "atspi", ok: true, chars: 22, masked: 1 },
      { platform: "linux", app: "*", method: "none", ok: false, reason: "screen-denied" },
      { platform: "linux", app: "chatgpt", ok: false, reason: "atspi-empty" },
    ]);
    const all = JSON.stringify(records) + logs.join("\n") + JSON.stringify(h.seen);
    expect(all).not.toContain("03-1234-5678");
    const t = tallyReads(records as never);
    expect(t.find((x) => x.app === "claude")?.verdict).toBe("atspi");
    expect(t.find((x) => x.app === "chatgpt")).toMatchObject({ verdict: "unreadable", lastReason: "atspi-empty" });
  });

  it("X11 の ready は AT-SPI と撮影の有無を出す", async () => {
    const child = fakeChild();
    const logs: string[] = [];
    startOverlayHost({
      binary: "/fake",
      platform: "linux",
      settings: settings(),
      deps: { spawnNative: () => child as never, appendRecord: async () => 1, log: (l) => logs.push(l), now: () => new Date() },
    });
    child.stdout.write('{"v":1,"type":"ready","platform":"linux","session":"x11","ax":true,"screen":true,"ocr":false}\n');
    await new Promise((r) => setTimeout(r, 20));
    expect(logs[0]).toContain("X11・AT-SPI: 使える");
    expect(logs[0]).toContain("文字認識: 無い");
  });
});

describe("自動更新（DK-07）", () => {
  const release = {
    tag_name: "v2026.9.10",
    html_url: "https://github.com/ttaiyosuzuki/neurafusion-desktop/releases/tag/v2026.9.10",
    assets: [
      { name: "neurafusion-desktop-2026.9.10.tgz", browser_download_url: "https://github.com/ttaiyosuzuki/neurafusion-desktop/releases/download/v2026.9.10/neurafusion-desktop-2026.9.10.tgz" },
    ],
  };

  const mk = (confirmAnswer: boolean, rel: unknown = release) => {
    const calls = { confirm: 0, install: [] as string[] };
    const deps: UpdateDeps = {
      fetchJson: async () => rel,
      confirm: async () => {
        calls.confirm += 1;
        return confirmAnswer;
      },
      install: async (u) => {
        calls.install.push(u);
      },
    };
    return { deps, calls };
  };

  it("版を比べる（CalVer）", () => {
    expect(compareVersions("2026.9.6", "2026.9.10")).toBeLessThan(0);
    expect(compareVersions("v2026.9.10", "2026.9.10")).toBe(0);
    expect(compareVersions("2026.10.1", "2026.9.30")).toBeGreaterThan(0);
    expect(compareVersions("x", "1")).toBeNull();
  });

  it("了承が無ければ入れ替えない", async () => {
    const { deps, calls } = mk(false);
    const r = await checkAndMaybeUpdate("2026.9.6", deps);
    expect(r.status).toBe("declined");
    expect(calls.confirm).toBe(1);
    expect(calls.install).toEqual([]);
  });

  it("了承されたら、その版の tarball を入れる", async () => {
    const { deps, calls } = mk(true);
    const r = await checkAndMaybeUpdate("2026.9.6", deps);
    expect(r.status).toBe("installed");
    expect(calls.install).toEqual([release.assets[0]!.browser_download_url]);
  });

  it("新しくなければ聞かない", async () => {
    const { deps, calls } = mk(true);
    expect((await checkAndMaybeUpdate("2026.9.10", deps)).status).toBe("up-to-date");
    expect(calls.confirm).toBe(0);
  });

  it("よそのリリースの URL・下書き・取得失敗では入れない", async () => {
    const bad = { ...release, assets: [{ name: "neurafusion-desktop-2026.9.10.tgz", browser_download_url: "https://evil.example/x.tgz" }] };
    const a = mk(true, bad);
    expect((await checkAndMaybeUpdate("2026.9.6", a.deps)).status).toBe("unknown");
    expect(a.calls.install).toEqual([]);
    expect(parseRelease({ ...release, draft: true })).toBeNull();
    const failing: UpdateDeps = { ...mk(true).deps, fetchJson: async () => { throw new Error("offline"); } };
    expect((await checkAndMaybeUpdate("2026.9.6", failing)).status).toBe("unknown");
  });
});
