// NF 右下の丸 — 対応アプリの一覧（DK-01/03/05）。
//
// 元: メインのリポジトリ engine/registry/tools.yaml の Tier 1（id・label は同じ値）。
// レジストリには bundle id・実行ファイル名が無いので、デスクトップ版のあるものだけを、
// **実機で確かめた値だけ**ここに書く（出どころつき）。推測で埋めない。
// 確かめていないアプリは mac/win を空にしておく（丸は出ない）。
//   - mac: CFBundleIdentifier（/Applications/<名前>.app/Contents/Info.plist を defaults read で読んだ値）
//   - win: 実行ファイル名（小文字で比較。dk-win が Windows 実機で確かめて足す）
//   - linux: X11 の WM_CLASS（instance か class。小文字で比較。Linux 機で xprop WM_CLASS を読んで足す）

export type OverlayReadMode = "ax-then-ocr" | "ax-only" | "off";

export type OverlayAppDef = {
  /** tools.yaml の id */
  id: string;
  label: string;
  /** tools.yaml の tier（ここには 1 だけ） */
  tier: 1;
  mac: string[];
  win: string[];
  linux: string[];
  /** 値の出どころ（プラットフォームごと） */
  source: { mac?: string; win?: string; linux?: string };
  /** 押したときの読み方の既定 */
  read: OverlayReadMode;
};

const MAC_MEASURED = "2026-09-29 dk-mac が開発機（macOS 26.6.2）の /Applications で defaults read した値";

export const OVERLAY_APPS: readonly OverlayAppDef[] = [
  {
    id: "claude",
    label: "Anthropic Claude",
    tier: 1,
    mac: ["com.anthropic.claudefordesktop"],
    win: [],
    linux: [],
    source: { mac: `${MAC_MEASURED}（Claude.app 2.9939.4）` },
    read: "ax-then-ocr",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    tier: 1,
    // 実測: /Applications/ChatGPT.app（CFBundleName=ChatGPT, 26.901.51231）の id は com.openai.codex だった。
    // 旧版の ChatGPT デスクトップの id はこの Mac では確かめていないので入れない。
    mac: ["com.openai.codex"],
    win: [],
    linux: [],
    source: { mac: `${MAC_MEASURED}（ChatGPT.app 26.901.51231）` },
    read: "ax-then-ocr",
  },
  {
    id: "cursor",
    label: "Cursor",
    tier: 1,
    mac: ["com.todesktop.230313mzl4w4u92"],
    win: [],
    linux: [],
    source: { mac: `${MAC_MEASURED}（Cursor.app 3.17.21）` },
    read: "ax-then-ocr",
  },
  {
    id: "notion",
    label: "Notion",
    tier: 1,
    mac: ["notion.id"],
    win: [],
    linux: [],
    source: { mac: `${MAC_MEASURED}（Notion.app 3.2.1）` },
    read: "ax-then-ocr",
  },
  // 以下は Tier 1 でデスクトップ版があり得るが、まだどの実機でも id を確かめていないもの（丸は出ない）。
  { id: "perplexity", label: "Perplexity AI", tier: 1, mac: [], win: [], linux: [], source: {}, read: "ax-then-ocr" },
  { id: "copilot", label: "Microsoft Copilot", tier: 1, mac: [], win: [], linux: [], source: {}, read: "ax-then-ocr" },
  { id: "grok", label: "xAI Grok", tier: 1, mac: [], win: [], linux: [], source: {}, read: "ax-then-ocr" },
  { id: "deepseek", label: "DeepSeek", tier: 1, mac: [], win: [], linux: [], source: {}, read: "ax-then-ocr" },
  { id: "kimi", label: "Kimi", tier: 1, mac: [], win: [], linux: [], source: {}, read: "ax-then-ocr" },
  { id: "doubao", label: "Doubao（豆包）", tier: 1, mac: [], win: [], linux: [], source: {}, read: "ax-then-ocr" },
  { id: "qwen", label: "Qwen（通義千問）", tier: 1, mac: [], win: [], linux: [], source: {}, read: "ax-then-ocr" },
];

export type OverlayPlatform = "macos" | "windows" | "linux";

/** そのプラットフォームで丸を出せる（識別子を確かめた）アプリか */
export function isSupportedOn(app: OverlayAppDef, platform: OverlayPlatform): boolean {
  if (platform === "macos") return app.mac.length > 0;
  if (platform === "windows") return app.win.length > 0;
  return app.linux.length > 0;
}

export function findOverlayApp(id: string): OverlayAppDef | undefined {
  return OVERLAY_APPS.find((a) => a.id === id);
}
