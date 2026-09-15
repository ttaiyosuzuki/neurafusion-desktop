/**
 * ★NF (b) 砦画面。
 *
 * 99%を機械が作った凝縮を出し、1%の判断を人に求める画面のロジック。
 *   [そのまま署名]   … 直しが無かった＝機械の出力が通った
 *   [直して署名]     … どこをどう直したかを型にして correction_log へ
 *   [余った]         … 出したのに要らなかった項目
 *   [足りなかった]   … 出さなかったのに要った項目
 *
 * 「余った」「足りなかった」は、次の凝縮を良くするための一番濃い水源。
 * ★生の値は記録しない。patternId と欄の名前だけ（利用規約 第16条の2 第2項）。
 */

/** 凝縮の1項目（画面に出るもの） */
export type CondensedItem = {
  /** 欄の識別子（生の値ではない） */
  fieldKey: string;
  /** 画面に出す名前 */
  label: string;
  /** 機械が入れた値。**端末内にだけある** */
  value: string | null;
  /** 出典（台帳ID or URL） */
  source?: string;
};

/** 署名の結果 */
export type SignDecision =
  | { kind: "as_is" }
  | { kind: "edited"; edits: FieldEdit[] }
  | { kind: "surplus"; fieldKeys: string[] }
  | { kind: "missing"; fieldKeys: string[] };

/** 1つの欄の直し。**直した後の値は持たない**（型だけ） */
export type FieldEdit = {
  fieldKey: string;
  /** どういう直し方だったか。生の文字列ではない */
  patternId: string;
};

/** correction_log へ入れる1行（そのまま送れる形） */
export type CorrectionLogRow = {
  fieldKey: string;
  patternId: string;
  atIso: string;
  /** どの種類の記録か */
  kind: "edit" | "surplus" | "missing";
};

/**
 * 直し方を型にする。
 * **元の値も直した値も受け取らない。** 呼び元が端末内で型を決めてから渡す。
 * ここに生値を通す口を作らないことが、この関数の一番大事な仕事。
 */
export const EDIT_PATTERNS = {
  /** 前後の空白を取った */
  trim_space: "trim_space",
  /** 表記を揃えた（全角半角・漢数字など） */
  normalize_form: "normalize_form",
  /** 日付の形を直した */
  fix_date_format: "fix_date_format",
  /** 数字を直した */
  fix_number: "fix_number",
  /** 別の候補に差し替えた */
  replace_choice: "replace_choice",
  /** 空にした（要らなかった） */
  clear_value: "clear_value",
  /** 自由記述で書き直した（中身は記録しない） */
  rewrite_free: "rewrite_free",
} as const;

export type EditPattern = (typeof EDIT_PATTERNS)[keyof typeof EDIT_PATTERNS];

/** 砦画面の1件 */
export class FortressCase {
  constructor(
    readonly caseId: string,
    readonly items: readonly CondensedItem[],
  ) {}

  /** 出した欄の一覧 */
  offeredFieldKeys(): string[] {
    return this.items.map((i) => i.fieldKey);
  }

  /** 値が入っていない欄（人に聞くべきところ） */
  blankFieldKeys(): string[] {
    return this.items.filter((i) => i.value == null || i.value === "").map((i) => i.fieldKey);
  }

  /** 凝縮率（値が入っている割合）。画面に出す数字 */
  filledRatio(): number {
    if (this.items.length === 0) return 0;
    const filled = this.items.filter((i) => i.value != null && i.value !== "").length;
    return filled / this.items.length;
  }
}

/**
 * 署名の決定を correction_log の行に変える。
 * ★[そのまま署名] は行を作らない（直しが無いので記録することが無い）。
 *   「直しゼロ」自体は別の指標（reviewer_score）で数える。
 */
export function toCorrectionRows(
  decision: SignDecision,
  atIso = new Date().toISOString(),
): CorrectionLogRow[] {
  switch (decision.kind) {
    case "as_is":
      return [];
    case "edited":
      return decision.edits.map((e) => ({
        fieldKey: e.fieldKey,
        patternId: e.patternId,
        atIso,
        kind: "edit" as const,
      }));
    case "surplus":
      return decision.fieldKeys.map((fieldKey) => ({
        fieldKey,
        patternId: "surplus",
        atIso,
        kind: "surplus" as const,
      }));
    case "missing":
      return decision.fieldKeys.map((fieldKey) => ({
        fieldKey,
        patternId: "missing",
        atIso,
        kind: "missing" as const,
      }));
  }
}

/**
 * correction_log の行に生値が混ざっていないかを検査する。
 * payloadGuard と同じ考え方で、**送る直前にもう一度見る**。
 */
export function guardCorrectionRows(rows: readonly CorrectionLogRow[]): {
  ok: boolean;
  rejected: { row: CorrectionLogRow; reason: string }[];
} {
  const idRe = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
  const rejected: { row: CorrectionLogRow; reason: string }[] = [];
  for (const row of rows) {
    if (!idRe.test(row.fieldKey)) {
      rejected.push({ row, reason: "fieldKey が識別子の形に合わない（生値の可能性）" });
    }
    if (!idRe.test(row.patternId)) {
      rejected.push({ row, reason: "patternId が識別子の形に合わない（生値の可能性）" });
    }
    if (Number.isNaN(Date.parse(row.atIso))) {
      rejected.push({ row, reason: "atIso が日時ではない" });
    }
  }
  return { ok: rejected.length === 0, rejected };
}
