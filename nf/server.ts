/**
 * ★NF (d) サーバ接続。
 *
 * NeuraFusion の Supabase エンドポイントへつなぐ。
 * ★鍵は **OSの保管庫（キーチェーン）にだけ** 置く。
 *   平文ファイルに書かない。当社サーバにも送らない。
 *
 * 対応する文書: THREAT_MODEL.md (b) 鍵の置き場
 */

import { guardOutboundPayload, type OutboundPayload, type GuardFinding } from "./payloadGuard.js";
import type { CorrectionLogRow } from "./fortress.js";
import { guardCorrectionRows } from "./fortress.js";

/** OSの保管庫の口。実装は OS ごとに差し替える（macOS Keychain / DPAPI / Secret Service） */
export interface SecretStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

/**
 * 平文ファイルに鍵を置く実装を **わざと用意しない**。
 * 用意すると、いつか誰かが「開発中だけ」と言って使い、そのまま出る。
 */
export const SECRET_NAMES = {
  /** NF サーバへ出すときの鍵 */
  serverToken: "NF_SERVER_TOKEN",
} as const;

export type ServerConfig = {
  /** NF の Supabase エンドポイント */
  baseUrl: string;
  /** 端末を識別する安定ハッシュ。氏名・メールは入れない */
  deviceHash: string;
};

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "no_token" | "rejected_by_guard" | "http_error"; findings?: GuardFinding[]; status?: number };

export class NeuraFusionServer {
  constructor(
    private readonly config: ServerConfig,
    private readonly secrets: SecretStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async authHeader(): Promise<Record<string, string> | null> {
    const token = await this.secrets.get(SECRET_NAMES.serverToken);
    if (!token) return null;
    /* ★鍵はここでしか触らない。ログにも例外文にも載せない */
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * 特徴量を送る。
   * ★送信の直前に全数検査を通す。落ちたら送らずに捨てる。
   */
  async sendFeatures(payload: unknown): Promise<SendResult> {
    const guarded = guardOutboundPayload(payload);
    if (!guarded.ok) {
      /* 中身はログに書かない。件数と場所だけ */
      return { ok: false, reason: "rejected_by_guard", findings: guarded.findings };
    }
    const auth = await this.authHeader();
    if (!auth) return { ok: false, reason: "no_token" };

    const res = await this.fetchImpl(`${this.config.baseUrl}/functions/v1/selfdata-ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ device: this.config.deviceHash, ...guarded.payload } satisfies Record<string, unknown>),
    });
    if (!res.ok) return { ok: false, reason: "http_error", status: res.status };
    return { ok: true };
  }

  /**
   * 砦画面の結果（correction_log）を送る。
   * こちらも送信直前に検査する。
   */
  async sendCorrections(rows: readonly CorrectionLogRow[]): Promise<SendResult> {
    const guarded = guardCorrectionRows(rows);
    if (!guarded.ok) {
      return {
        ok: false,
        reason: "rejected_by_guard",
        findings: guarded.rejected.map((r) => ({ path: r.row.fieldKey, reason: r.reason })),
      };
    }
    if (rows.length === 0) return { ok: true }; /* 直しゼロ＝送るものが無い */

    const auth = await this.authHeader();
    if (!auth) return { ok: false, reason: "no_token" };

    const res = await this.fetchImpl(`${this.config.baseUrl}/functions/v1/selfdata-ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ device: this.config.deviceHash, kind: "correction_log", rows }),
    });
    if (!res.ok) return { ok: false, reason: "http_error", status: res.status };
    return { ok: true };
  }

  /** 取り消しをサーバへ伝える（端末側の削除は ConsentStore が行う） */
  async revokeChannel(channel: string): Promise<SendResult> {
    const auth = await this.authHeader();
    if (!auth) return { ok: false, reason: "no_token" };
    const res = await this.fetchImpl(`${this.config.baseUrl}/functions/v1/selfdata-ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth },
      body: JSON.stringify({ device: this.config.deviceHash, kind: "revoke", channel }),
    });
    if (!res.ok) return { ok: false, reason: "http_error", status: res.status };
    return { ok: true };
  }
}

/** 鍵が入っているかだけを見る（値は返さない） */
export async function hasServerToken(secrets: SecretStore): Promise<boolean> {
  return (await secrets.get(SECRET_NAMES.serverToken)) !== null;
}

/** 画面に出す1行（鍵の値は絶対に出さない） */
export async function serverStatusLine(secrets: SecretStore): Promise<string> {
  return (await hasServerToken(secrets))
    ? "NeuraFusion に接続しています（鍵はこの端末の保管庫にあります）"
    : "未接続です。鍵はこの端末の保管庫にだけ保存されます";
}
