// NF 右下の丸 — アプリごとのオン・オフとパネルの URL（DK-05）。
// 既定: 今のプラットフォームで識別子を確かめた対応アプリだけオン。本人が変えた分だけ保存する。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { OVERLAY_APPS, isSupportedOn, type OverlayAppDef, type OverlayPlatform, type OverlayReadMode } from "./apps.js";
import type { OverlayConfigMessage } from "./protocol.js";
import { FF_DEFAULT_SETTINGS, normalizeFfSettings, type FfSettings } from "../ff/settings.js";

export type OverlaySettings = {
  version: 1;
  /** 本人が変えたアプリだけ（id → オン・オフ） */
  enabled: Record<string, boolean>;
  /** 本人が変えた読み方 */
  read: Record<string, OverlayReadMode>;
  /** パネルの Web 画面。無ければ「未接続」 */
  panelUrl?: string;
  /** 自動更新の確認（DK-07）。既定オン */
  checkUpdates: boolean;
  /** 読み取った本文をパネルへ渡すこと（SB-01 の同意）。既定オフ＝文字数だけ示す */
  sendTextToPanel: boolean;
  /**
   * 受け身の記録・ホバー（FX-31・FX-34）のための常時の読み取り。既定オフ（本人 2026-10-04: 本番では何も渡さない）。
   * docs/overlay-protocol.md の守ること 1（丸を押す前に読まない・常時の監視をしない）とぶつかるので、オンにするのは本人が決めた後だけ。
   * オフの間、取り先の供給（supply.ts）は要素の木を分けもせず何も渡さない。
   */
  passiveAlwaysOn: boolean;
  /** FF 先読み（全体キー・宛先など。src/ff/settings.ts） */
  ff: FfSettings;
};

export const DEFAULT_SETTINGS: OverlaySettings = {
  version: 1,
  enabled: {},
  read: {},
  checkUpdates: true,
  sendTextToPanel: false,
  passiveAlwaysOn: false,
  ff: FF_DEFAULT_SETTINGS,
};

export function overlayStateDir(): string {
  return path.join(os.homedir(), ".neurafusion", "overlay");
}

export function overlaySettingsPath(dir = overlayStateDir()): string {
  return path.join(dir, "settings.json");
}

export function normalizeSettings(raw: unknown): OverlaySettings {
  const s = { ...DEFAULT_SETTINGS, enabled: {}, read: {}, ff: normalizeFfSettings(undefined) } as OverlaySettings;
  if (!raw || typeof raw !== "object") return s;
  const r = raw as Partial<OverlaySettings>;
  if (r.enabled && typeof r.enabled === "object") {
    for (const [k, v] of Object.entries(r.enabled)) if (typeof v === "boolean") s.enabled[k] = v;
  }
  if (r.read && typeof r.read === "object") {
    for (const [k, v] of Object.entries(r.read)) {
      if (v === "ax-then-ocr" || v === "ax-only" || v === "off") s.read[k] = v;
    }
  }
  if (typeof r.panelUrl === "string" && isAllowedPanelUrl(r.panelUrl)) s.panelUrl = r.panelUrl;
  if (typeof r.checkUpdates === "boolean") s.checkUpdates = r.checkUpdates;
  if (typeof r.sendTextToPanel === "boolean") s.sendTextToPanel = r.sendTextToPanel;
  if (typeof r.passiveAlwaysOn === "boolean") s.passiveAlwaysOn = r.passiveAlwaysOn;
  s.ff = normalizeFfSettings(r.ff);
  return s;
}

/** パネルに開いてよい URL: https、または手元（127.0.0.1・localhost）の http。ネイティブ側も同じ判定をする。 */
export function isAllowedPanelUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

export async function loadSettings(dir = overlayStateDir()): Promise<OverlaySettings> {
  try {
    return normalizeSettings(JSON.parse(await readFile(overlaySettingsPath(dir), "utf8")));
  } catch {
    return normalizeSettings(undefined);
  }
}

export async function saveSettings(s: OverlaySettings, dir = overlayStateDir()): Promise<void> {
  await mkdir(dir, { recursive: true });
  const p = overlaySettingsPath(dir);
  const tmp = `${p}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(s, null, 2)}\n`, "utf8");
  await rename(tmp, p);
}

/** そのアプリが今オンか（本人の設定 > 既定＝そのプラットフォームで対応済みならオン） */
export function isEnabled(app: OverlayAppDef, s: OverlaySettings, platform: OverlayPlatform): boolean {
  if (!isSupportedOn(app, platform)) return false; // 識別子が無いアプリは出しようがない
  return s.enabled[app.id] ?? true;
}

export function setEnabled(s: OverlaySettings, id: string, on: boolean): OverlaySettings {
  if (!OVERLAY_APPS.some((a) => a.id === id)) throw new Error(`対応アプリにありません: ${id}`);
  return { ...s, enabled: { ...s.enabled, [id]: on } };
}

/** ネイティブに渡す config（docs/overlay-protocol.md） */
export function buildConfigMessage(
  s: OverlaySettings,
  platform: OverlayPlatform,
  apps: readonly OverlayAppDef[] = OVERLAY_APPS,
): OverlayConfigMessage {
  return {
    v: 1,
    type: "config",
    apps: apps
      .filter((a) => isSupportedOn(a, platform))
      .map((a) => ({
        id: a.id,
        label: a.label,
        mac: [...a.mac],
        win: [...a.win],
        linux: [...a.linux],
        enabled: isEnabled(a, s, platform),
        read: s.read[a.id] ?? a.read,
      })),
    ...(s.panelUrl ? { panelUrl: s.panelUrl } : {}),
    panelMode: s.panelUrl ? "url" : "disconnected",
    ocrConsent: "ask-each-time",
    size: 44,
    margin: 16,
  };
}
