// NF 右下の丸 — ネイティブ ⇄ Node の約束（docs/overlay-protocol.md）の型と1行の読み書き。
// Mac（apps/nf-overlay-macos）と Windows（dk-win）の両方がこの形で話す。

import type { OverlayReadMode } from "./apps.js";

export const OVERLAY_PROTOCOL_VERSION = 1;

export type OverlayRect = { x: number; y: number; w: number; h: number };

export type OverlayConfigApp = {
  id: string;
  label: string;
  mac: string[];
  win: string[];
  enabled: boolean;
  read: OverlayReadMode;
};

export type OverlayConfigMessage = {
  v: 1;
  type: "config";
  apps: OverlayConfigApp[];
  panelUrl?: string;
  panelMode: "url" | "disconnected";
  ocrConsent: "ask-each-time";
  size: number;
  margin: number;
};

export type OverlayInbound =
  | OverlayConfigMessage
  | { v: 1; type: "stop" }
  | { v: 1; type: "panel-text"; text: string };

export type ReadFailureReason =
  | "ax-denied"
  | "ax-empty"
  | "screen-denied"
  | "consent-declined"
  | "ocr-empty"
  | "read-off";

export type NativeMessage =
  | { v: number; type: "ready"; platform: "macos" | "windows"; ax: boolean; screen: boolean }
  | { v: number; type: "geometry"; app: string; window: OverlayRect; dot: OverlayRect }
  | { v: number; type: "hidden"; reason: "not-target" | "disabled" | "no-window" }
  | { v: number; type: "clicked"; app: string }
  | {
      v: number;
      type: "read";
      app: string;
      method: "ax" | "ocr" | "uia" | "none";
      ok: boolean;
      chars: number;
      reason?: ReadFailureReason;
      text?: string;
    }
  | { v: number; type: "panel"; open: boolean; mode: "url" | "disconnected" }
  | { v: number; type: "error"; code: string; message: string };

const NATIVE_TYPES = new Set(["ready", "geometry", "hidden", "clicked", "read", "panel", "error"]);

/** ネイティブからの1行を読む。知らない type・壊れた行は null（読み飛ばす）。 */
export function parseNativeLine(line: string): NativeMessage | null {
  const t = line.trim();
  if (!t) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(t);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const type = (obj as { type?: unknown }).type;
  if (typeof type !== "string" || !NATIVE_TYPES.has(type)) return null;
  return obj as NativeMessage;
}

/** Node → ネイティブの1行（改行つき） */
export function encodeInbound(msg: OverlayInbound): string {
  return `${JSON.stringify(msg)}\n`;
}

/** ログに書いてよい形（read の本文を落とす） */
export function redactForLog(msg: NativeMessage): NativeMessage {
  if (msg.type === "read" && "text" in msg) {
    const { text: _text, ...rest } = msg;
    return rest;
  }
  return msg;
}
