// 取り込み元: neurafusion-171268ee engine/ff/contract.ts（1325961b）。手で直さない。
// 差し替えは scripts/nf-ff/sync-engine.sh（engine/ff のバンドルと一緒に入れる）。

/**
 * FF「先読み」— 3面（拡張・デスクトップ・Web）と engine/ff の約束（型だけ）。
 *
 * 手順書: tools/agent-tasks/2026-09-30_ff-foresight.md §2
 * - 端末の外に出してよいのは正規化トークン（patternId）と集計数値だけ（利用規約 第16条の2）。
 *   ここに出てくる文字列はすべて declang の正規トークンで、生の本文・件名・相手の識別子は入れない。
 * - 手（FfMove）は実在の記録から作る。支持数 N が 1 未満の手は作れない（makeMove を通す）。
 */

/** declang で正規化したトークン（例: "edit:ts", "err:tsc"）。生の本文ではない。 */
export type FfToken = string;

/** 端末内で正規化した今の作業の状態。 */
export interface FfState {
  /** 直近の正規トークン列（古い→新しい）。 */
  recent_tokens: FfToken[];
  /** 直前の編集（正規トークン）。無ければ null。 */
  last_edit: FfToken | null;
  /** 捨てた提案（正規トークン）。 */
  rejected: FfToken[];
  /** エラー（正規トークン）。 */
  errors: FfToken[];
  /** 問い直し（正規トークン）。 */
  probes: FfToken[];
}

/** 支持数 N ≥ 1 を型で表す（makeMove を通らない限り作れない）。 */
export type SupportN = number & { readonly __supportN: unique symbol };

/** 1手。 */
export interface FfMove {
  /** 何手目か（1 始まり）。 */
  step: number;
  /** 次の手の正規トークン。 */
  token: FfToken;
  /** 画面に出す短い表示（token から決定的に作る。生の本文は入れない）。 */
  label: string;
  /** この手を実際に打った記録の数（≥ 1）。 */
  support_n: SupportN;
  /** 根拠となった記録の参照（匿名化済みの trace id）。空にはならない。 */
  trace_refs: string[];
  /** 何本目の枝か（0 = 最有力）。FF-03 の「別の枝」で +1。 */
  branch: number;
  /** どこまで先か（0 = 今の状態の直後）。FF-03 の「さらに先」で +1。 */
  depth: number;
}

/** foresee が流す1コマ。 */
export type FfFrame =
  | { type: "move"; move: FfMove }
  | { type: "none"; reason: "no_record" | "no_state" }
  | { type: "done" };

/** foresee の指定。k は 3〜5。 */
export interface FfForeseeOptions {
  k: 3 | 4 | 5;
  depth: number;
  branch: number;
}

/** 前計算した索引（端末に置ける JSON。識別子なし）。中身の形は engine/ff/index.ts が決める。 */
export interface FfIndexLike {
  readonly kind: "ff-index";
  readonly version: number;
}

/**
 * 最初の1手を最優先で yield する。
 * 実在の記録が無ければ { type: "none", reason: "no_record" } を1つ出して終わる。
 */
export type Foresee = (
  state: FfState,
  index: FfIndexLike,
  opts: FfForeseeOptions,
) => AsyncGenerator<FfFrame>;

/** 指示文の宛先。差は書式だけ。 */
export type FfTarget = "openclaw" | "claude-code" | "cursor" | "generic";

/** 選んだ道筋を、本人が使っている AI への指示文にする。NF は実行しない。 */
export type ToInstruction = (path: FfMove[], target: FfTarget) => string;

/** 記録（ランキングの教師に使う）。 */
export type FfEventKind =
  | "shown" // 手を表示した
  | "next" // もう一度押した（さらに先）
  | "branch" // 別の枝
  | "adopt" // これで行く（何手目まで）
  | "stop" // どこで止めたか
  | "dismiss"; // 閉じた（負例ではなく「見ただけ」）

export interface FfEvent {
  kind: FfEventKind;
  /** 端末内の時刻（ms）。 */
  at: number;
  /** 表示の単位（1回の起動ごと）。匿名の乱数 id。 */
  session: string;
  /** 対象の手（正規トークンと位置だけ）。 */
  moves: Array<Pick<FfMove, "step" | "token" | "branch" | "depth" | "support_n">>;
  /** adopt: 何手目まで採用したか ／ stop: 何手目で止めたか。 */
  upto_step?: number;
  /** 状態の patternId（正規トークン列のハッシュ）。 */
  state_pattern: string;
}

/** 面ごとの設定に保存するキー（engine/ff/keys.json の既定を上書きする）。 */
export interface FfKeyBinding {
  /** 起動＝もう一度押す（同じキー）。 */
  trigger: string;
  /** これで行く。 */
  adopt: string;
  /** 閉じる（表示中だけ効く）。 */
  close: string;
}
