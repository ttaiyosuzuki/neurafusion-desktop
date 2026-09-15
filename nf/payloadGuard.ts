/**
 * ★NF (a) 送信ペイロードの全数検査。
 *
 * この製品は「あなたのPCの中を読む」と言っている。
 * だから **端末から出る1件ずつを、出る直前に全数検査する**。
 * 検査に落ちたものは送らず、端末内で破棄する。
 *
 * 設計の要点:
 *   型だけでは足りない。TypeScript の型は実行時に消えるので、
 *   any が混ざった経路や JSON.parse 由来の値は素通りする。
 *   だから**実行時に値そのものを見る**関数をここに置き、
 *   送信経路はこの関数を通らないと外に出られないようにする。
 *
 * 対応する条文: 利用規約 第16条の2 第2項
 * 対応する文書: THREAT_MODEL.md (a) 何を読み、何を送るか
 */

/** 端末外に出してよい唯一の形 */
export type OutboundPayload = {
  /** 端末内で作った型の識別子。生の文字列ではない */
  patternIds: string[];
  /** 分野ごとの集計値（0〜1 に正規化済み） */
  metrics: Record<string, number>;
  /** いつ作ったか */
  producedAtIso: string;
  /** どの同意スコープで作ったか（監査用） */
  consentScopeId: string;
};

export type GuardFinding = {
  /** どの場所で見つかったか */
  path: string;
  /** 何が問題か */
  reason: string;
};

export type GuardResult =
  | { ok: true; payload: OutboundPayload }
  | { ok: false; findings: GuardFinding[] };

/** patternId の形: 英小文字・数字・アンダースコア・ハイフン・ドットのみ。最大64文字 */
const PATTERN_ID_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

/** 指標のキーも同じ規則 */
const METRIC_KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

/**
 * 生値と判定する手がかり。
 * ここに挙げたものが patternId や指標キーに現れたら、それは型ではなく中身。
 */
const RAW_VALUE_SIGNALS: { re: RegExp; reason: string }[] = [
  { re: /[@＠]/, reason: "メールアドレスまたはメンションの断片が含まれている" },
  { re: /https?:\/\//i, reason: "URL が含まれている" },
  { re: /[ぁ-んァ-ヶ一-龠]/, reason: "日本語が含まれている（型ではなく本文の可能性）" },
  { re: /[A-Z]{2,}/, reason: "大文字の連続が含まれている（識別子の生値の可能性）" },
  { re: /\+?\d[\d\s()-]{8,}/, reason: "電話番号らしき数字列が含まれている" },
  { re: /\s/, reason: "空白が含まれている（型に空白は入らない）" },
];

/** 1つの patternId を検査する */
function checkPatternId(value: unknown, path: string, findings: GuardFinding[]): void {
  if (typeof value !== "string") {
    findings.push({ path, reason: `文字列ではない（${typeof value}）` });
    return;
  }
  if (!PATTERN_ID_RE.test(value)) {
    findings.push({ path, reason: "patternId の形（英小文字・数字・_-. 最大64字）に合わない" });
    /* 形が違う時点で落とすが、理由をもう1段詳しく出す */
  }
  for (const { re, reason } of RAW_VALUE_SIGNALS) {
    if (re.test(value)) findings.push({ path, reason });
  }
}

/**
 * 送信直前の全数検査。
 * **この関数を通らない値は端末外に出さないこと。**
 */
export function guardOutboundPayload(input: unknown): GuardResult {
  const findings: GuardFinding[] = [];

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, findings: [{ path: "$", reason: "オブジェクトではない" }] };
  }
  const o = input as Record<string, unknown>;

  /* 知らない鍵が1つでもあれば落とす。
     「増やしたら勝手に出る」を防ぐため、許可した鍵だけを通す。 */
  const ALLOWED = new Set(["patternIds", "metrics", "producedAtIso", "consentScopeId"]);
  for (const k of Object.keys(o)) {
    if (!ALLOWED.has(k)) {
      findings.push({ path: `$.${k}`, reason: "許可していない項目。増やすときは検査も一緒に増やすこと" });
    }
  }

  /* patternIds */
  if (!Array.isArray(o.patternIds)) {
    findings.push({ path: "$.patternIds", reason: "配列ではない" });
  } else {
    if (o.patternIds.length > 500) {
      findings.push({ path: "$.patternIds", reason: "件数が多すぎる（500件まで）" });
    }
    o.patternIds.forEach((v, i) => checkPatternId(v, `$.patternIds[${i}]`, findings));
  }

  /* metrics */
  if (o.metrics === null || typeof o.metrics !== "object" || Array.isArray(o.metrics)) {
    findings.push({ path: "$.metrics", reason: "オブジェクトではない" });
  } else {
    const m = o.metrics as Record<string, unknown>;
    const keys = Object.keys(m);
    if (keys.length > 200) {
      findings.push({ path: "$.metrics", reason: "項目が多すぎる（200件まで）" });
    }
    for (const k of keys) {
      if (!METRIC_KEY_RE.test(k)) {
        findings.push({ path: `$.metrics.${k}`, reason: "指標キーの形に合わない" });
      }
      for (const { re, reason } of RAW_VALUE_SIGNALS) {
        if (re.test(k)) findings.push({ path: `$.metrics.${k}`, reason });
      }
      const v = m[k];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        findings.push({ path: `$.metrics.${k}`, reason: "数値ではない" });
      } else if (v < 0 || v > 1) {
        findings.push({ path: `$.metrics.${k}`, reason: "0〜1 に正規化されていない" });
      }
    }
  }

  /* producedAtIso */
  if (typeof o.producedAtIso !== "string" || Number.isNaN(Date.parse(o.producedAtIso))) {
    findings.push({ path: "$.producedAtIso", reason: "ISO 日時ではない" });
  }

  /* consentScopeId */
  if (typeof o.consentScopeId !== "string" || !PATTERN_ID_RE.test(o.consentScopeId)) {
    findings.push({ path: "$.consentScopeId", reason: "同意スコープの識別子の形に合わない" });
  }

  if (findings.length > 0) return { ok: false, findings };
  return { ok: true, payload: o as unknown as OutboundPayload };
}

/**
 * 送信経路の唯一の入口。
 * 検査に落ちたら **送らずに捨てる**。例外は投げず、呼び元が記録できるように結果を返す。
 */
export async function sendGuarded(
  payload: unknown,
  send: (p: OutboundPayload) => Promise<void>,
  onRejected?: (findings: GuardFinding[]) => void,
): Promise<{ sent: boolean; findings: GuardFinding[] }> {
  const result = guardOutboundPayload(payload);
  if (!result.ok) {
    onRejected?.(result.findings);
    /* ★落ちたペイロードは端末内で破棄する。再送しない。中身をログにも書かない */
    return { sent: false, findings: result.findings };
  }
  await send(result.payload);
  return { sent: true, findings: [] };
}
