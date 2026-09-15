import { describe, it, expect } from "vitest";
import { guardOutboundPayload, sendGuarded, type OutboundPayload } from "../payloadGuard.js";
import { ConsentStore, CONSENT_CHANNELS, defaultScopes } from "../consent.js";
import { FortressCase, toCorrectionRows, guardCorrectionRows, EDIT_PATTERNS } from "../fortress.js";
import { TossInbox, toTossView, type Toss } from "../toss.js";
import { summarize, toFieldPatternId, responseSpeedScore, densityScore, toOutboundPayload } from "../features.js";
import { NeuraFusionServer, SECRET_NAMES, hasServerToken, type SecretStore } from "../server.js";

/** 検査を通る最小のペイロード */
const okPayload: OutboundPayload = {
  patternIds: ["field.souzoku", "tool.xlsx"],
  metrics: { "field.souzoku.speed": 0.8 },
  producedAtIso: "2026-09-15T00:00:00.000Z",
  consentScopeId: "scope_slack",
};

describe("(a) 送信ペイロードの全数検査", () => {
  it("正しい形は通る", () => {
    const r = guardOutboundPayload(okPayload);
    expect(r.ok).toBe(true);
  });

  it("日本語が混ざったら落とす（本文の混入）", () => {
    const r = guardOutboundPayload({ ...okPayload, patternIds: ["相続税の申告"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.findings.some((f) => f.reason.includes("日本語"))).toBe(true);
  });

  it("メールアドレスらしきものが混ざったら落とす", () => {
    const r = guardOutboundPayload({ ...okPayload, patternIds: ["a@example.com"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.findings.some((f) => f.reason.includes("メールアドレス"))).toBe(true);
  });

  it("URL が混ざったら落とす", () => {
    const r = guardOutboundPayload({ ...okPayload, patternIds: ["https://x.com/someone"] });
    expect(r.ok).toBe(false);
  });

  it("電話番号らしき数字列を落とす", () => {
    const r = guardOutboundPayload({ ...okPayload, metrics: { "090-1234-5678": 0.5 } });
    expect(r.ok).toBe(false);
  });

  it("許可していない項目が増えたら落とす（勝手に出さない）", () => {
    const r = guardOutboundPayload({ ...okPayload, rawBody: "本文そのもの" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.findings.some((f) => f.path === "$.rawBody")).toBe(true);
  });

  it("0〜1 に正規化されていない数値を落とす", () => {
    expect(guardOutboundPayload({ ...okPayload, metrics: { "a.b": 42 } }).ok).toBe(false);
    expect(guardOutboundPayload({ ...okPayload, metrics: { "a.b": -1 } }).ok).toBe(false);
  });

  it("件数が多すぎたら落とす", () => {
    const many = Array.from({ length: 501 }, (_, i) => `p${i}`);
    expect(guardOutboundPayload({ ...okPayload, patternIds: many }).ok).toBe(false);
  });

  it("落ちたペイロードは送られない（捨てる）", async () => {
    let sentCount = 0;
    const r = await sendGuarded({ ...okPayload, patternIds: ["本文"] }, async () => {
      sentCount += 1;
    });
    expect(r.sent).toBe(false);
    expect(sentCount).toBe(0);
    expect(r.findings.length).toBeGreaterThan(0);
  });

  it("通ったペイロードだけ送られる", async () => {
    let received: OutboundPayload | null = null;
    const r = await sendGuarded(okPayload, async (p) => {
      received = p;
    });
    expect(r.sent).toBe(true);
    expect(received).not.toBeNull();
  });
});

describe("(e) 同意スコープ", () => {
  it("既定はすべてオフ", () => {
    const store = new ConsentStore();
    expect(store.grantedChannels()).toEqual([]);
    expect(defaultScopes().every((s) => s.granted === false)).toBe(true);
    expect(store.statusLine()).toContain("既定はすべてオフ");
  });

  it("カメラと位置情報は接続先の一覧に存在しない（S22 裁定）", () => {
    expect((CONSENT_CHANNELS as readonly string[]).includes("camera")).toBe(false);
    expect((CONSENT_CHANNELS as readonly string[]).includes("location")).toBe(false);
  });

  it("端末外に出る広さは変更できない（pattern_only 固定）", () => {
    for (const s of defaultScopes()) expect(s.visibility).toBe("pattern_only");
  });

  it("取り消すと、端末とサーバの両方の削除が呼ばれる", async () => {
    const calls: string[] = [];
    const store = new ConsentStore(
      async (c) => { calls.push(`local:${c}`); },
      async (c) => { calls.push(`remote:${c}`); },
    );
    store.grant("slack");
    expect(store.isGranted("slack")).toBe(true);
    await store.revoke("slack");
    expect(store.isGranted("slack")).toBe(false);
    expect(calls).toEqual(["local:slack", "remote:slack"]);
  });

  it("監査ログに中身は書かず、件数だけ残す", () => {
    const store = new ConsentStore();
    store.grant("line");
    store.recordSend("line", 12);
    store.recordReject("line", 3);
    const log = store.auditLog();
    expect(log.map((e) => e.action)).toEqual(["grant", "send", "reject"]);
    expect(log[1].patternCount).toBe(12);
    expect(log[2].rejectedCount).toBe(3);
    /* 中身を入れる場所が型として無いこと */
    expect(JSON.stringify(log)).not.toContain("本文");
  });
});

describe("(b) 砦画面", () => {
  const c = new FortressCase("case1", [
    { fieldKey: "who", label: "亡くなった方", value: "父", source: "ledger:1" },
    { fieldKey: "what", label: "対象", value: null },
    { fieldKey: "when", label: "日付", value: "2026-01-01" },
  ]);

  it("凝縮率と空欄が出る", () => {
    expect(c.filledRatio()).toBeCloseTo(2 / 3, 5);
    expect(c.blankFieldKeys()).toEqual(["what"]);
  });

  it("[そのまま署名] は correction_log に行を作らない", () => {
    expect(toCorrectionRows({ kind: "as_is" })).toEqual([]);
  });

  it("[直して署名] は型だけを記録する（直した値は持たない）", () => {
    const rows = toCorrectionRows({
      kind: "edited",
      edits: [{ fieldKey: "who", patternId: EDIT_PATTERNS.normalize_form }],
    }, "2026-09-15T00:00:00.000Z");
    expect(rows).toEqual([
      { fieldKey: "who", patternId: "normalize_form", atIso: "2026-09-15T00:00:00.000Z", kind: "edit" },
    ]);
    expect(JSON.stringify(rows)).not.toContain("父");
  });

  it("[余った][足りなかった] が記録できる", () => {
    expect(toCorrectionRows({ kind: "surplus", fieldKeys: ["when"] })[0].kind).toBe("surplus");
    expect(toCorrectionRows({ kind: "missing", fieldKeys: ["where"] })[0].kind).toBe("missing");
  });

  it("生値が混ざった行は送る前に落ちる", () => {
    const bad = guardCorrectionRows([
      { fieldKey: "亡くなった方", patternId: "trim_space", atIso: "2026-09-15T00:00:00.000Z", kind: "edit" },
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.rejected[0].reason).toContain("生値の可能性");
  });
});

describe("(c) Hey Agent のトス受信", () => {
  const toss: Toss = {
    tossId: "t1",
    field: "souzoku",
    summary: "相続登記の検品を1件",
    estimatedMinutes: 30,
    estimatedYen: null,
    arrivedAtIso: "2026-09-15T00:00:00.000Z",
    expiresAtIso: "2026-09-16T00:00:00.000Z",
  };

  it("接続していない道具からは受け取らない（勝手に鳴らさない）", () => {
    const inbox = new TossInbox(() => false);
    const r = inbox.receive("slack", toss);
    expect(r.accepted).toBe(false);
    expect(inbox.pending(new Date("2026-09-15T01:00:00Z"))).toEqual([]);
  });

  it("接続していれば受け取る", () => {
    const inbox = new TossInbox(() => true);
    expect(inbox.receive("slack", toss).accepted).toBe(true);
    expect(inbox.pending(new Date("2026-09-15T01:00:00Z")).length).toBe(1);
  });

  it("同じトスを二重に受けない", () => {
    const inbox = new TossInbox(() => true);
    inbox.receive("slack", toss);
    expect(inbox.receive("slack", toss).accepted).toBe(false);
  });

  it("相場の出典が無い金額は「準備中」として出す（推測しない）", () => {
    const v = toTossView(toss, new Date("2026-09-15T01:00:00Z"));
    expect(v.priceUnknown).toBe(true);
    expect(v.remainingLabel).toContain("あと");
  });

  it("期限切れは未決から消える", () => {
    const inbox = new TossInbox(() => true);
    inbox.receive("slack", toss);
    expect(inbox.pending(new Date("2026-09-17T00:00:00Z"))).toEqual([]);
  });

  it("受ける／断るを記録する", () => {
    const inbox = new TossInbox(() => true);
    inbox.receive("slack", toss);
    expect(inbox.decide("t1", "decline")).toBe(true);
    expect(inbox.decisionOf("t1")).toBe("decline");
    expect(inbox.decide("t1", "accept")).toBe(false);
  });
});

describe("(a) 分身測定の特徴量", () => {
  it("分野名を型に落とす。落とせないものは null（推測で作らない）", () => {
    expect(toFieldPatternId("souzoku")).toBe("field.souzoku");
    expect(toFieldPatternId("相続税")).toBeNull();
    expect(toFieldPatternId("")).toBeNull();
  });

  it("速いほど点が高い・遅いほど低い", () => {
    expect(responseSpeedScore(0)).toBeCloseTo(1, 5);
    expect(responseSpeedScore(60)).toBeCloseTo(0.5, 5);
    expect(responseSpeedScore(60 * 24)).toBeLessThan(0.05);
  });

  it("往復が多いほど濃い（20で頭打ち）", () => {
    expect(densityScore(0)).toBe(0);
    expect(densityScore(10)).toBeCloseTo(0.5, 5);
    expect(densityScore(100)).toBe(1);
  });

  it("要約に相手の識別子が残らない（人数だけになる）", () => {
    const s = summarize([
      { channel: "slack", field: "souzoku", localCounterpartRef: "taro@example.com", responseMinutes: 30, exchanges: 10, atIso: "2026-09-15T00:00:00Z" },
      { channel: "slack", field: "souzoku", localCounterpartRef: "hanako@example.com", responseMinutes: 60, exchanges: 6, atIso: "2026-09-15T00:00:00Z" },
    ]);
    expect(s.local.counterpartCount).toBe(2);
    expect(JSON.stringify({ patternIds: s.patternIds, metrics: s.metrics })).not.toContain("example.com");
  });

  it("型に落とせない観測は捨てて、捨てた数を残す", () => {
    const s = summarize([
      { channel: "slack", field: "相続税", localCounterpartRef: "x", responseMinutes: 10, exchanges: 3, atIso: "2026-09-15T00:00:00Z" },
    ]);
    expect(s.patternIds).toEqual([]);
    expect(s.local.droppedCount).toBe(1);
  });

  it("要約から作ったペイロードは、そのまま検査を通る", () => {
    const s = summarize([
      { channel: "slack", field: "souzoku", localCounterpartRef: "x", responseMinutes: 15, exchanges: 8, atIso: "2026-09-15T00:00:00Z" },
    ], [{ toolPatternId: "xlsx", uses: 3, atIso: "2026-09-15T00:00:00Z" }]);
    const p = toOutboundPayload(s, "scope_slack", "2026-09-15T00:00:00.000Z");
    const r = guardOutboundPayload(p);
    expect(r.ok).toBe(true);
  });
});

describe("(d) サーバ接続と鍵", () => {
  class MemorySecrets implements SecretStore {
    private m = new Map<string, string>();
    async get(n: string) { return this.m.get(n) ?? null; }
    async set(n: string, v: string) { this.m.set(n, v); }
    async delete(n: string) { this.m.delete(n); }
  }

  it("鍵が無ければ送らない", async () => {
    const secrets = new MemorySecrets();
    expect(await hasServerToken(secrets)).toBe(false);
    const srv = new NeuraFusionServer({ baseUrl: "https://example.test", deviceHash: "d1" }, secrets);
    const r = await srv.sendFeatures(okPayload);
    expect(r).toEqual({ ok: false, reason: "no_token" });
  });

  it("検査に落ちたら、鍵を読む前に止まる", async () => {
    const secrets = new MemorySecrets();
    let getCalls = 0;
    const spy: SecretStore = {
      get: async (n) => { getCalls += 1; return secrets.get(n); },
      set: (n, v) => secrets.set(n, v),
      delete: (n) => secrets.delete(n),
    };
    const srv = new NeuraFusionServer({ baseUrl: "https://example.test", deviceHash: "d1" }, spy);
    const r = await srv.sendFeatures({ ...okPayload, patternIds: ["本文が入った"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("rejected_by_guard");
    expect(getCalls).toBe(0);
  });

  it("鍵があれば送れる。鍵の値は本文に載らない", async () => {
    const secrets = new MemorySecrets();
    await secrets.set(SECRET_NAMES.serverToken, "super-secret-token");
    let sentBody = "";
    const fakeFetch = (async (_u: string, init?: RequestInit) => {
      sentBody = String(init?.body ?? "");
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;
    const srv = new NeuraFusionServer({ baseUrl: "https://example.test", deviceHash: "d1" }, secrets, fakeFetch);
    const r = await srv.sendFeatures(okPayload);
    expect(r.ok).toBe(true);
    expect(sentBody).not.toContain("super-secret-token");
  });

  it("直しゼロなら送るものが無い", async () => {
    const secrets = new MemorySecrets();
    const srv = new NeuraFusionServer({ baseUrl: "https://example.test", deviceHash: "d1" }, secrets);
    expect(await srv.sendCorrections([])).toEqual({ ok: true });
  });
});
