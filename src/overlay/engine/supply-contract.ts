// 取り込み元: NF の Web のリポジトリ（neurafusion）の engine の型だけ。手で直さない（中身を変えるときは取り込み元に合わせて写し直す）。
//   - engine/passive/config.ts（4bfc52ee5）: READ_ORIGINS・ReadOrigin・ElementOrigin
//   - engine/passive/attention.ts（20cf9cefe）: ExposedItem・UiEvent（FX-31 受け身の決定の入口）
//   - engine/hover/state.ts（4bfc52ee5）: HoverElement・HoverEvent（FX-34 ホバーの入口）
//   - engine/hover/config.json の hover.context_window（1）
// engine の実行時の束はデスクトップに無い。ここは「渡す事件の形」を合わせるためだけの写し（FF の src/ff/engine/contract.ts と同じやり方）。

/** FY-16 読んでよい要素の出どころ（本人の入力・AI の出力）。これ以外（third_party・印なし）は読まない（read-scope.ts） */
export const READ_ORIGINS = ["self_input", "ai_output"] as const;
export type ReadOrigin = (typeof READ_ORIGINS)[number];
/** 取り先（常駐アプリ・拡張）が要素に付ける出どころ。third_party＝ほかの人の発言・取ってきたページ・画面上の第三者の文 */
export type ElementOrigin = ReadOrigin | "third_party";

export type ExposedItem = {
  item_id: string;
  /** 一般化した種別（paragraph・candidate・search_result・file …） */
  kind: string;
  /** FY-16 出どころ（取り先が付ける）。self_input・ai_output 以外は読まない */
  origin: ElementOrigin;
  /** 生の文（入力にはあってよいが、出力には絶対に写さない） */
  raw_text?: string;
};

export type UiEvent =
  | { type: "exposed"; ts: string; items: ExposedItem[] }
  | { type: "dwell"; ts: string; item_id: string; ms: number }
  | { type: "select"; ts: string; item_id: string; via: "adopt" | "open" | "paste" }
  /** [FY-27] scroll_to_end＝項目の下端までスクロール（主信号） */
  | { type: "copy" | "expand" | "scroll_to_end"; ts: string; item_id: string }
  | { type: "leave"; ts: string };

export type HoverElement = {
  element_id: string;
  /** 一般化した種別（paragraph・code_block・file_name・candidate …） */
  kind: string;
  /** FY-16 出どころ（取り先が付ける）。self_input・ai_output 以外は読まない */
  origin: ElementOrigin;
  /** 生の文（入力にはあってよい。出力には写さない） */
  raw_text?: string;
  /** 前後の文脈の要素（生の文は同じく写さない。第三者の要素は読まない） */
  context?: readonly { kind: string; origin: ElementOrigin; raw_text?: string }[];
};

export type HoverEvent =
  | { type: "enter"; ts: number; element: HoverElement }
  | { type: "move"; ts: number; element: HoverElement }
  | { type: "leave"; ts: number }
  | { type: "tick"; ts: number };

/** engine/hover/config.json の hover.context_window（前後の文脈の要素の数） */
export const HOVER_CONTEXT_WINDOW = 1;
