// v7 OP-09c 端末の中の台帳と索引（node:sqlite・FTS5）。W4 の knowledge.sqlite がまだ無いので、見本の JSON
// （trace-ledger.sample.json）から同じ考え方の小さな sqlite を作る: 取り込むたびに版を 1 つ増やし、取得元と日を残す。
// 索引は「言葉の一致」（FTS5 の trigram）。近さの索引（埋め込み）は W4 の Embedder が来たら足す。
// ネットにつながなくても全部動く（オフラインで 業種・マス・レンズ・前提の鎖 まで）。
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { requireNodeSqlite } from "../infra/node-sqlite.js";
import type { SourceRef } from "./types.js";

export interface LedgerVerb {
  id: string;
  name: string;
  examples: string[];
  critical_layers: string[];
  questions: { q: string; layer: string }[];
}
export interface LedgerLayer {
  id: string;
  name: string;
  looks_at: string;
  beginner_gap: string;
}
export interface LedgerLens {
  id: string;
  verb: string;
  verbs: string[];
  name: string;
  regulated: string[];
}
export interface LedgerPrereqTopic {
  id: string;
  target_action: string;
  domain: string;
  lens_ids: string[];
  must_include_actions: string[];
  must_include_paths: string[];
}
export interface LedgerNaics {
  code: string;
  title: string;
  title_ja: string;
  words: string[];
  lens_ids: string[];
  parents: string[];
  source: SourceRef;
  provisional?: boolean;
}
export interface LedgerJson {
  version: number;
  source: string;
  provisional: boolean;
  note?: string;
  verbs: LedgerVerb[];
  layers: LedgerLayer[];
  lenses: LedgerLens[];
  prereq_topics: LedgerPrereqTopic[];
  naics: LedgerNaics[];
}

export interface LedgerVersion {
  version: number;
  imported_at: string;
  source: string;
  provisional: boolean;
}

export const SAMPLE_LEDGER_PATH = new URL("./trace-ledger.sample.json", import.meta.url);

/** 見本の JSON の形を確かめる（合わない時は取り込まず、何が合わないかを返す） */
export function checkLedgerJson(j: unknown): string[] {
  const p: string[] = [];
  const o = j as Partial<LedgerJson> | null;
  if (!o || typeof o !== "object") return ["台帳が JSON のオブジェクトではない"];
  for (const k of ["verbs", "layers", "lenses", "prereq_topics", "naics"] as const) {
    if (!Array.isArray(o[k])) p.push(`${k} が配列ではない`);
  }
  if (typeof o.source !== "string") p.push("source が無い");
  for (const n of o.naics ?? []) {
    if (!/^\d{6}$/.test(n.code)) p.push(`naics ${n.code}: 6 桁ではない`);
    if (!n.source || !/^https:\/\//.test(n.source.url)) p.push(`naics ${n.code}: 出典の URL が無い`);
  }
  const lensIds = new Set((o.lenses ?? []).map((l) => l.id));
  for (const n of o.naics ?? []) {
    for (const id of n.lens_ids ?? []) if (!lensIds.has(id)) p.push(`naics ${n.code}: レンズ ${id} が無い`);
  }
  return p;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (version INTEGER PRIMARY KEY, imported_at TEXT NOT NULL, source TEXT NOT NULL, provisional INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS verb (v INTEGER NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (v, id));
CREATE TABLE IF NOT EXISTS layer (v INTEGER NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (v, id));
CREATE TABLE IF NOT EXISTS lens (v INTEGER NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (v, id));
CREATE TABLE IF NOT EXISTS prereq (v INTEGER NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (v, id));
CREATE TABLE IF NOT EXISTS naics (v INTEGER NOT NULL, code TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY (v, code));
CREATE VIRTUAL TABLE IF NOT EXISTS idx USING fts5(v UNINDEXED, kind UNINDEXED, id UNINDEXED, text, tokenize = 'trigram');
`;

/** 端末の台帳（読み出しは今の版だけ・前の版に戻せる） */
export class LedgerStore {
  private constructor(private readonly db: DatabaseSync) {}

  /** path は ":memory:" か sqlite のファイル（既定の置き場は呼ぶ側が決める・例 ~/.neurafusion/knowledge/knowledge.sqlite） */
  static open(path: string): LedgerStore {
    const { DatabaseSync } = requireNodeSqlite();
    const db = new DatabaseSync(path);
    db.exec(SCHEMA);
    return new LedgerStore(db);
  }

  close(): void {
    this.db.close();
  }

  /** 取り込み: 検査に通った時だけ新しい版として入れる */
  importJson(j: LedgerJson, now: Date = new Date()): { ok: true; version: number } | { ok: false; problems: string[] } {
    const problems = checkLedgerJson(j);
    if (problems.length) return { ok: false, problems };
    const row = this.db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM meta").get() as { v: number };
    const v = row.v + 1;
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("INSERT INTO meta (version, imported_at, source, provisional) VALUES (?, ?, ?, ?)")
        .run(v, now.toISOString(), j.source, j.provisional ? 1 : 0);
      const put = (table: string, id: string, obj: unknown) =>
        this.db.prepare(`INSERT INTO ${table} (v, ${table === "naics" ? "code" : "id"}, json) VALUES (?, ?, ?)`).run(v, id, JSON.stringify(obj));
      const ix = this.db.prepare("INSERT INTO idx (v, kind, id, text) VALUES (?, ?, ?, ?)");
      for (const x of j.verbs) put("verb", x.id, x);
      for (const x of j.layers) put("layer", x.id, x);
      for (const x of j.lenses) {
        put("lens", x.id, x);
        ix.run(v, "lens", x.id, x.name);
      }
      for (const x of j.prereq_topics) put("prereq", x.id, x);
      for (const x of j.naics) {
        put("naics", x.code, x);
        ix.run(v, "naics", x.code, [x.title_ja, x.title, ...x.words].join(" "));
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
    return { ok: true, version: v };
  }

  importFile(path: string | URL, now?: Date) {
    return this.importJson(JSON.parse(readFileSync(path, "utf8")) as LedgerJson, now);
  }

  /** 前の版に戻す（今の版を消す） */
  rollback(): number | null {
    const cur = this.version();
    if (!cur) return null;
    for (const t of ["verb", "layer", "lens", "prereq", "naics", "idx"]) this.db.prepare(`DELETE FROM ${t} WHERE v = ?`).run(cur.version);
    this.db.prepare("DELETE FROM meta WHERE version = ?").run(cur.version);
    return this.version()?.version ?? null;
  }

  version(): LedgerVersion | null {
    const r = this.db.prepare("SELECT version, imported_at, source, provisional FROM meta ORDER BY version DESC LIMIT 1").get() as
      | { version: number; imported_at: string; source: string; provisional: number }
      | undefined;
    return r ? { version: r.version, imported_at: r.imported_at, source: r.source, provisional: r.provisional === 1 } : null;
  }

  private all<T>(table: string): T[] {
    const v = this.version()?.version ?? 0;
    return (this.db.prepare(`SELECT json FROM ${table} WHERE v = ? ORDER BY rowid`).all(v) as { json: string }[]).map((r) => JSON.parse(r.json) as T);
  }

  verbs(): LedgerVerb[] {
    return this.all<LedgerVerb>("verb");
  }
  layers(): LedgerLayer[] {
    return this.all<LedgerLayer>("layer");
  }
  lenses(): LedgerLens[] {
    return this.all<LedgerLens>("lens");
  }
  prereqTopics(): LedgerPrereqTopic[] {
    return this.all<LedgerPrereqTopic>("prereq");
  }
  naicsAll(): LedgerNaics[] {
    return this.all<LedgerNaics>("naics");
  }

  /** 言葉の一致（FTS5 trigram・3 字以上の語）。kinds で絞る */
  search(q: string, opts: { kinds?: ("naics" | "lens")[]; k: number }): { kind: string; id: string; score: number }[] {
    const v = this.version()?.version ?? 0;
    const terms = Array.from(new Set(q.split(/[\s、。・「」（）()]+/).filter((t) => [...t].length >= 3)));
    if (!terms.length) return [];
    const match = terms.map((t) => `"${t.replaceAll('"', '""')}"`).join(" OR ");
    const rows = this.db
      .prepare("SELECT kind, id, bm25(idx) AS s FROM idx WHERE idx MATCH ? AND v = ? ORDER BY s LIMIT ?")
      .all(match, v, Math.max(1, opts.k * 3)) as { kind: string; id: string; s: number }[];
    return rows
      .filter((r) => !opts.kinds || opts.kinds.includes(r.kind as "naics" | "lens"))
      .slice(0, opts.k)
      .map((r) => ({ kind: r.kind, id: r.id, score: -r.s }));
  }
}
