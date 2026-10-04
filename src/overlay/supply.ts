// NF 右下の丸 — 取り先の供給（FY-16 (4)・常駐アプリの側）。ネイティブの elements の行（要素の木の写し）を
// origin.ts の規則で分け、engine の passive（FX-31 UiEvent）・hover（FX-34 HoverEvent）の形にして渡す。
//
// 守ること:
//   - 受け手は同じプロセスの中で subscribe した関数だけ。送信の口（ネットワーク・ファイル・ネイティブへの行・ログ）には繋がない。
//   - 受け手が居ないあいだは何もしない（木を分けもしない）。
//   - 返す数・stats は数だけ（文・id・種別は残さない）。
//   - 常時の読み取り（settings.ts の passiveAlwaysOn）がオフなら何もしない（既定オフ・本人 2026-10-04）。

import type { OverlayPlatform } from "./apps.js";
import type { HoverEvent, UiEvent } from "./engine/supply-contract.js";
import { classifyTree, exposedEvent, hoverEvent, type AppOriginHints, type OriginResult, type WholeDrop } from "./origin.js";
import type { NativeMessage } from "./protocol.js";

export type SupplyEvent = { to: "passive"; event: UiEvent } | { to: "hover"; event: HoverEvent };

export type ElementsMsg = Extract<NativeMessage, { type: "elements" }>;

export type SupplyOutcome = { supplied: number; not_read: number; whole?: WholeDrop; idle?: true; off?: true };

export type OverlaySupply = {
  /** 受け手を足す（戻り値で外す） */
  subscribe: (fn: (e: SupplyEvent) => void) => () => void;
  /** ネイティブの elements の行を受ける */
  onElements: (msg: ElementsMsg) => SupplyOutcome;
  /** ホバーの滞在を進める（engine の tick） */
  tick: (ts: number) => void;
  /** これまでの数（文は持たない） */
  stats: () => { supplied: number; not_read: number };
};

export function createOverlaySupply(opts: {
  platform: OverlayPlatform;
  hints?: readonly AppOriginHints[];
  /** 確かめていない手がかりも使う（合成の見本のテストだけ） */
  allowUnverified?: boolean;
  /** 常時の読み取り（settings.ts の passiveAlwaysOn をそのまま渡す）。無ければオフ */
  alwaysOn?: boolean;
  now?: () => Date;
}): OverlaySupply {
  const subs = new Set<(e: SupplyEvent) => void>();
  const now = opts.now ?? (() => new Date());
  let supplied = 0;
  let notRead = 0;
  let hovering: string | null = null;

  const emit = (e: SupplyEvent) => {
    for (const fn of [...subs]) {
      try {
        fn(e);
      } catch {
        // 受け手の失敗で丸を止めない
      }
    }
  };

  return {
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    onElements(msg) {
      if (opts.alwaysOn !== true) return { supplied: 0, not_read: 0, off: true };
      if (subs.size === 0) return { supplied: 0, not_read: 0, idle: true };
      const res: OriginResult = classifyTree(msg.root, {
        app: msg.app,
        platform: opts.platform,
        hints: opts.hints,
        allowUnverified: opts.allowUnverified,
      });
      supplied += res.elements.length;
      notRead += res.not_read;
      const at = now();
      const exposed = exposedEvent(res, at.toISOString());
      if (exposed) emit({ to: "passive", event: exposed });
      if ("hover" in msg) {
        const h = hoverEvent(res, msg.hover, at.getTime());
        const id = h.type === "enter" ? h.element.element_id : null;
        // 同じ段落に乗ったままなら出さない（engine は移動で取り消す）。離れたら leave を 1 回だけ
        if (id !== hovering) {
          emit({ to: "hover", event: h });
          hovering = id;
        }
      }
      return { supplied: res.elements.length, not_read: res.not_read, ...(res.whole ? { whole: res.whole } : {}) };
    },
    tick(ts) {
      if (opts.alwaysOn !== true || subs.size === 0 || hovering === null) return;
      emit({ to: "hover", event: { type: "tick", ts } });
    },
    stats: () => ({ supplied, not_read: notRead }),
  };
}
