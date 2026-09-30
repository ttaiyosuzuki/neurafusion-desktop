// FF「先読み」— デスクトップの設定（丸と同じ ~/.neurafusion/overlay/settings.json の "ff"）。
// 本人が変えた分だけ保存する。キーは engine/ff/keys.json の既定を上書きする（FF-01）。

import type { FfKeyBinding, FfTarget } from "./engine/contract.js";
import { FF_KEY_SCOPES, bindingToChords, chordLabel, resolveBinding, type FfPlatform, type FfKeyProblem } from "./keys.js";
import type { FfConfigMessage } from "./protocol.js";

export type FfSettings = {
  /** 全体キーを登録するか（既定オン。押すまで何も出ない） */
  enabled: boolean;
  /** 本人が変えたキーだけ */
  keys: Partial<FfKeyBinding>;
  /** 指示文の宛先（書式だけが変わる） */
  target: FfTarget;
  /** これで行く のとき、OpenClaw の入力欄にも入れる（送信は本人が押す）。既定オフ＝クリップボードだけ */
  openclawDraft: boolean;
  /** 行の不透明度 */
  opacity: number;
};

export const FF_DEFAULT_SETTINGS: FfSettings = {
  enabled: true,
  keys: {},
  target: "openclaw",
  openclawDraft: false,
  opacity: 0.72,
};

const TARGETS = new Set<FfTarget>(["openclaw", "claude-code", "cursor", "generic"]);

export function normalizeFfSettings(raw: unknown): FfSettings {
  const s: FfSettings = { ...FF_DEFAULT_SETTINGS, keys: {} };
  if (!raw || typeof raw !== "object") return s;
  const r = raw as Partial<FfSettings>;
  if (typeof r.enabled === "boolean") s.enabled = r.enabled;
  if (r.keys && typeof r.keys === "object") {
    for (const k of ["trigger", "adopt", "close"] as const) {
      const v = (r.keys as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) s.keys[k] = v.trim();
    }
  }
  if (typeof r.target === "string" && TARGETS.has(r.target as FfTarget)) s.target = r.target as FfTarget;
  if (typeof r.openclawDraft === "boolean") s.openclawDraft = r.openclawDraft;
  if (typeof r.opacity === "number" && Number.isFinite(r.opacity)) s.opacity = Math.min(0.95, Math.max(0.3, r.opacity));
  return s;
}

/** ネイティブに渡す ff-config と、キーの問題（あれば既定に戻したことを知らせる用）。 */
export function buildFfConfig(s: FfSettings, platform: FfPlatform): { msg: FfConfigMessage; problems: FfKeyProblem[] } {
  const { binding, problems } = resolveBinding(s.keys);
  const keys = bindingToChords(binding);
  return {
    msg: {
      v: 1,
      type: "ff-config",
      enabled: s.enabled,
      keys,
      scopes: { ...FF_KEY_SCOPES },
      labels: {
        trigger: chordLabel(keys.trigger, platform),
        adopt: chordLabel(keys.adopt, platform),
        close: chordLabel(keys.close, platform),
      },
      opacity: s.opacity,
    },
    problems,
  };
}
