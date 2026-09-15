/**
 * ★NF (e) 同意スコープ。local / folder の切替・監査ログ・取り消しで即削除。
 *
 * サイトの SAFETY 文面と **同じ動作** にすること（食い違うと、書いた方が嘘になる）。
 * 対応する条文: 利用規約 第16条の2 第1項・第5項・第6項
 */

/** 接続できる対象。カメラと位置情報は S22 裁定で読まないので、ここに無い */
export const CONSENT_CHANNELS = [
  "email",
  "slack",
  "teams",
  "discord",
  "line",
  "instagram",
  "x_dm",
  "copilot",
  "files",
  "apps",
] as const;

export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

/** 読み取りの広さ。local = 端末内で完結 / folder = 指定した階層だけ */
export type ConsentScopeKind = "local" | "folder";

export type ConsentScope = {
  /** 検査を通る形の識別子（payloadGuard と同じ規則） */
  id: string;
  channel: ConsentChannel;
  kind: ConsentScopeKind;
  granted: boolean;
  /** ★変更できない。端末外に出るのは型だけ */
  readonly visibility: "pattern_only";
  grantedAtIso?: string;
  revokedAtIso?: string;
  /** 対象の目印。**端末内にだけ保存する**。送信しない */
  scopeHint?: string;
};

/** 監査ログの1行。本人がいつでも見られる */
export type AuditEntry = {
  atIso: string;
  action: "grant" | "revoke" | "send" | "reject";
  channel: ConsentChannel;
  /** 送ったときだけ。何件の型を送ったか（中身は書かない） */
  patternCount?: number;
  /** 落ちたときだけ。理由の件数（中身は書かない） */
  rejectedCount?: number;
};

/** 既定はすべてオフ */
export function defaultScopes(): ConsentScope[] {
  return CONSENT_CHANNELS.map((channel) => ({
    id: `scope_${channel}`,
    channel,
    kind: "local",
    granted: false,
    visibility: "pattern_only",
  }));
}

export class ConsentStore {
  private scopes: Map<ConsentChannel, ConsentScope>;
  private audit: AuditEntry[] = [];
  /** 端末内・サーバ側それぞれの削除を呼ぶ口。取り消し時に両方を叩く */
  constructor(
    private readonly deleteLocal: (channel: ConsentChannel) => Promise<void> = async () => {},
    private readonly deleteRemote: (channel: ConsentChannel) => Promise<void> = async () => {},
  ) {
    this.scopes = new Map(defaultScopes().map((s) => [s.channel, s]));
  }

  list(): ConsentScope[] {
    return [...this.scopes.values()];
  }

  get(channel: ConsentChannel): ConsentScope | undefined {
    return this.scopes.get(channel);
  }

  /** いま読んでよい対象だけ */
  grantedChannels(): ConsentChannel[] {
    return this.list().filter((s) => s.granted).map((s) => s.channel);
  }

  isGranted(channel: ConsentChannel): boolean {
    return this.scopes.get(channel)?.granted === true;
  }

  grant(channel: ConsentChannel, kind: ConsentScopeKind = "local", scopeHint?: string, nowIso = new Date().toISOString()): void {
    const s = this.scopes.get(channel);
    if (!s) return;
    this.scopes.set(channel, { ...s, granted: true, kind, scopeHint, grantedAtIso: nowIso, revokedAtIso: undefined });
    this.audit.push({ atIso: nowIso, action: "grant", channel });
  }

  /**
   * 取り消し。**端末とサーバの両方から即時削除する。**
   * 削除は、そこから導かれた学習結果にも及ぶ（呼び先の責務）。
   */
  async revoke(channel: ConsentChannel, nowIso = new Date().toISOString()): Promise<void> {
    const s = this.scopes.get(channel);
    if (!s) return;
    this.scopes.set(channel, { ...s, granted: false, scopeHint: undefined, revokedAtIso: nowIso });
    this.audit.push({ atIso: nowIso, action: "revoke", channel });
    /* 記録を先に残してから消す。消してから落ちると、消したことが分からなくなる */
    await this.deleteLocal(channel);
    await this.deleteRemote(channel);
  }

  /** 送った記録（中身は書かない。件数だけ） */
  recordSend(channel: ConsentChannel, patternCount: number, nowIso = new Date().toISOString()): void {
    this.audit.push({ atIso: nowIso, action: "send", channel, patternCount });
  }

  /** 検査に落ちた記録（中身は書かない。件数だけ） */
  recordReject(channel: ConsentChannel, rejectedCount: number, nowIso = new Date().toISOString()): void {
    this.audit.push({ atIso: nowIso, action: "reject", channel, rejectedCount });
  }

  /** 本人が見る監査ログ */
  auditLog(): readonly AuditEntry[] {
    return this.audit;
  }

  /** 画面に出す1行 */
  statusLine(): string {
    const on = this.grantedChannels();
    if (on.length === 0) return "接続している道具はありません（既定はすべてオフ）";
    return `接続中: ${on.length}件。いつでも個別に止められます`;
  }
}
