// FF「先読み」— 丸のホスト（src/overlay/host.ts）に FF をつなぐ。
// ネイティブへ ff-config を送り、返ってきた ff-* を FfController に渡す。

import { randomBytes } from "node:crypto";
import type { FfPlatform } from "./keys.js";
import { copyToClipboard, sendDraftToOpenclaw } from "./deliver.js";
import { loadEngine, loadProductionIndex, type FfEngine } from "./engine.js";
import type { FfIndexLike } from "./engine/contract.js";
import { encodeFf, type FfNativeMessage } from "./protocol.js";
import { fileRecorder } from "./record.js";
import { FF_SESSION_DEFAULTS, FfController, type FfSessionDeps } from "./session.js";
import { buildFfConfig, type FfSettings } from "./settings.js";
import { readCurrentState } from "./state.js";

export type FfWire = {
  controller: FfController;
  /** ネイティブの ff-* を受ける */
  onNative: (m: FfNativeMessage) => void;
  /** 設定が変わったら ff-config を送り直す */
  reconfigure: (s: FfSettings) => void;
  /** 登録できなかったキー（最後の ff-keys） */
  failedKeys: () => string[];
  /** エンジンのバンドルが入っているか */
  bundled: boolean;
};

/** 索引は押すたびに読み直さない（押した瞬間の時間を食わないように、起動時と5分ごとに読む）。 */
function cachedIndex(load: () => Promise<FfIndexLike>, ttlMs = 5 * 60_000): () => Promise<FfIndexLike> {
  let at = 0;
  let cur: Promise<FfIndexLike> | null = null;
  return () => {
    const now = Date.now();
    if (!cur || now - at > ttlMs) {
      at = now;
      cur = load();
    }
    return cur;
  };
}

export async function startFf(opts: {
  platform: FfPlatform;
  settings: FfSettings;
  write: (line: string) => void;
  log: (line: string) => void;
  /** テスト用の差し替え（本番の CLI からは渡さない） */
  overrides?: Partial<FfSessionDeps> & { engine?: FfEngine };
}): Promise<FfWire> {
  const { platform, write, log } = opts;
  let settings = opts.settings;
  const { engine, bundled } = opts.overrides?.engine
    ? { engine: opts.overrides.engine, bundled: true }
    : await loadEngine();
  const loadIndex = cachedIndex(async () => (await loadProductionIndex()).index);
  void loadIndex(); // 起動時に読んでおく
  const deps: FfSessionDeps = {
    engine,
    loadIndex,
    readState: async () => (await readCurrentState()).state,
    send: (m) => write(encodeFf(m)),
    copy: (text) => copyToClipboard(text, platform),
    ...(settings.openclawDraft ? { draftToOpenclaw: (text: string) => sendDraftToOpenclaw(text, platform) } : {}),
    record: fileRecorder(),
    now: () => performance.now(),
    newId: () => `ffs_${randomBytes(6).toString("hex")}`,
    setTimer: (fn, ms) => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return { cancel: () => clearTimeout(t) };
    },
    target: settings.target,
    ...FF_SESSION_DEFAULTS,
    ...opts.overrides,
  };
  const controller = new FfController(deps);
  let failed: string[] = [];
  const sendConfig = () => {
    const { msg, problems } = buildFfConfig(settings, platform);
    if (problems.length > 0) log(`先読みのキーの設定に問題があるので既定に戻しました（${problems.map((p) => `${p.action}:${p.code}`).join("・")}）`);
    write(encodeFf(msg));
  };
  sendConfig();
  return {
    controller,
    bundled,
    onNative(m) {
      if (m.type === "ff-key") void controller.onKey(m.action, m.press);
      else if (m.type === "ff-drawn") controller.onDrawn(m.press, m.seq, m.ms);
      else if (m.type === "ff-keys") {
        failed = m.failed;
        if (!m.ok) log(`先読みのキーを登録できませんでした（${m.failed.join("・")}）。overlay ff keys で変えられます`);
      }
    },
    reconfigure(s) {
      settings = s;
      sendConfig();
    },
    failedKeys: () => failed,
  };
}
