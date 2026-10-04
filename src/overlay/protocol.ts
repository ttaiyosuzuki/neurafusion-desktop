// NF 右下の丸 — ネイティブ ⇄ Node の約束（docs/overlay-protocol.md）の型と1行の読み書き。
// Mac（apps/nf-overlay-macos）と Windows（dk-win）の両方がこの形で話す。

import type { OverlayReadMode } from "./apps.js";
import type { AxSnapNode } from "./origin.js";

export const OVERLAY_PROTOCOL_VERSION = 1;

export type OverlayRect = { x: number; y: number; w: number; h: number };

export type OverlayConfigApp = {
  id: string;
  label: string;
  mac: string[];
  win: string[];
  /** Linux（dk-linux）: X11 の WM_CLASS（小文字で比較） */
  linux: string[];
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
  | "read-off"
  // Windows（dk-win）: Mac の ax-… に対応する分は uia-…、文字認識の失敗は ocr-error
  | "uia-empty"
  | "uia-error"
  | "ocr-error"
  // Linux（dk-linux）: アクセシビリティは AT-SPI
  | "atspi-empty"
  | "atspi-error";

export type NativeMessage =
  // Mac は ax（アクセシビリティの許可）、Windows は uia（UI Automation。許可は要らないので常に true）
  // Linux は session（x11 / wayland）と ocr（端末内の文字認識があるか）も付ける
  | {
      v: number;
      type: "ready";
      platform: "macos" | "windows" | "linux";
      ax?: boolean;
      uia?: boolean;
      screen: boolean;
      version?: string;
      session?: "x11" | "wayland";
      ocr?: boolean;
    }
  // window・dot は論理座標。Windows は拡大率 scale と物理ピクセルの px も付ける
  | {
      v: number;
      type: "geometry";
      app: string;
      window: OverlayRect;
      dot: OverlayRect;
      scale?: number;
      px?: { window: OverlayRect; dot: OverlayRect };
      /** Linux の Wayland: 画面の右下に固定（app は "*"、window は作業領域） */
      fixed?: boolean;
    }
  | { v: number; type: "hidden"; reason: "not-target" | "disabled" | "no-window" }
  | { v: number; type: "clicked"; app: string }
  | {
      v: number;
      type: "read";
      app: string;
      method: "ax" | "ocr" | "uia" | "atspi" | "none";
      ok: boolean;
      chars: number;
      reason?: ReadFailureReason;
      text?: string;
    }
  | { v: number; type: "panel"; open: boolean; mode: "url" | "disconnected" }
  | { v: number; type: "error"; code: string; message: string }
  // FY-16 (4): 対象の窓の要素の木の写し（出どころは付けない。決めるのは origin.ts）。hover はカーソルの下の要素の位置（子の番号の列）
  | {
      v: number;
      type: "elements";
      app: string;
      method: "ax" | "uia" | "atspi";
      root: AxSnapNode;
      hover?: number[] | null;
    };

const NATIVE_TYPES = new Set(["ready", "geometry", "hidden", "clicked", "read", "panel", "error", "elements"]);

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

/** ログに書いてよい形（read の本文・elements の木を落とす） */
export function redactForLog(msg: NativeMessage): NativeMessage {
  if (msg.type === "read" && "text" in msg) {
    const { text: _text, ...rest } = msg;
    return rest;
  }
  if (msg.type === "elements") {
    const { root: _root, hover: _hover, ...rest } = msg;
    return { ...rest, root: { role: "redacted" } };
  }
  return msg;
}
