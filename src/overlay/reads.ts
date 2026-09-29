// NF 右下の丸 — 「読めた・読めない」の記録（DK-02）と、読んだ文字の扱い（DK-05・SB-01 と同じ）。
// 記録に本文は残さない（アプリ・方法・成否・理由・文字数・時刻だけ）。

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { scrubPii } from "../kensan/pii.js";
import type { NativeMessage, OverlayConfigMessage, ReadFailureReason } from "./protocol.js";
import { overlayStateDir, type OverlaySettings } from "./settings.js";

export type OverlayReadRecord = {
  at: string;
  platform: "macos" | "windows";
  app: string;
  method: "ax" | "ocr" | "uia" | "none";
  ok: boolean;
  reason?: ReadFailureReason;
  chars: number;
  /** PII 除去で伏せた数（本文は残さない） */
  masked?: number;
};

export type ReadVerdict = "ax" | "uia" | "ocr" | "unreadable" | "untried";

export type AppReadTally = {
  app: string;
  ok: number;
  failed: number;
  byMethod: Record<string, number>;
  lastReason?: ReadFailureReason;
  verdict: ReadVerdict;
};

export function overlayReadsPath(dir = overlayStateDir()): string {
  return path.join(dir, "reads.json");
}

type ReadMsg = Extract<NativeMessage, { type: "read" }>;

/** ネイティブの read から記録を作る（本文は入れない）。 */
export function toReadRecord(
  msg: ReadMsg,
  platform: "macos" | "windows",
  now: Date = new Date(),
  masked?: number,
): OverlayReadRecord {
  return {
    at: now.toISOString(),
    platform,
    app: msg.app,
    method: msg.method,
    ok: msg.ok,
    ...(msg.reason ? { reason: msg.reason } : {}),
    chars: typeof msg.chars === "number" ? msg.chars : 0,
    ...(typeof masked === "number" ? { masked } : {}),
  };
}

export async function appendReadRecord(rec: OverlayReadRecord, file = overlayReadsPath()): Promise<number> {
  let list: OverlayReadRecord[] = [];
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (Array.isArray(parsed)) list = parsed as OverlayReadRecord[];
  } catch {
    list = [];
  }
  list.push(rec);
  // 端末内の記録が際限なく伸びないよう、新しい 2000 件だけ残す
  if (list.length > 2000) list = list.slice(-2000);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(list, null, 2), "utf8");
  await rename(tmp, file);
  return list.length;
}

export async function loadReadRecords(file = overlayReadsPath()): Promise<OverlayReadRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as OverlayReadRecord[]) : [];
  } catch {
    return [];
  }
}

/** アプリごとの「読めた・読めない」。AX（UIA）で読めたことがあればそれ、次に文字認識、失敗だけなら読めない。 */
export function tallyReads(records: readonly OverlayReadRecord[]): AppReadTally[] {
  const by = new Map<string, AppReadTally>();
  for (const r of records) {
    const t = by.get(r.app) ?? { app: r.app, ok: 0, failed: 0, byMethod: {}, verdict: "untried" as ReadVerdict };
    if (r.ok) {
      t.ok += 1;
      t.byMethod[r.method] = (t.byMethod[r.method] ?? 0) + 1;
    } else {
      t.failed += 1;
      if (r.reason) t.lastReason = r.reason;
    }
    by.set(r.app, t);
  }
  for (const t of by.values()) {
    t.verdict = t.byMethod.ax ? "ax" : t.byMethod.uia ? "uia" : t.byMethod.ocr ? "ocr" : t.failed ? "unreadable" : "untried";
  }
  return [...by.values()].sort((a, b) => a.app.localeCompare(b.app));
}

/**
 * 読んだ文字をパネルへどう渡すか（SB-01 と同じ: 本人の同意の範囲だけ、生の文字は必要な分だけ）。
 *  - 未接続: 本文は渡さない（パネルは文字数だけ示す）
 *  - 手元（127.0.0.1・localhost）の画面: 端末の外に出ないので、PII を伏せて渡す
 *  - それ以外（https の Web 画面）: 本人が sendTextToPanel をオンにしたときだけ、PII を伏せて渡す
 */
export type PanelTextDecision = { send: false; why: "disconnected" | "no-consent" } | { send: true; text: string; masked: number };

export function decidePanelText(
  text: string,
  settings: OverlaySettings,
  config: Pick<OverlayConfigMessage, "panelMode" | "panelUrl">,
): PanelTextDecision {
  if (config.panelMode !== "url" || !config.panelUrl) return { send: false, why: "disconnected" };
  let local = false;
  try {
    const h = new URL(config.panelUrl).hostname;
    local = h === "127.0.0.1" || h === "localhost";
  } catch {
    return { send: false, why: "disconnected" };
  }
  if (!local && !settings.sendTextToPanel) return { send: false, why: "no-consent" };
  const scrubbed = scrubPii(text);
  return { send: true, text: scrubbed.text, masked: scrubbed.maskedCount };
}
