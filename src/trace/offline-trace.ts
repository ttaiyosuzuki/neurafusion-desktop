// v7 OP-09c 道筋（デスクトップ）: 端末の台帳だけで出せる段（業種・要るマス・レンズ・別の道・前提の鎖）と、
// 鍵がある時だけモデルの段（道筋・本質の確認・次の一手）。W5 の本物の buildTrace がまだ無いので、その代役。
// 形は NF の engine/trace/types.ts の buildTrace(req, deps): AsyncIterable<TraceEvent> と同じ。
// 拡張の extension-kensan/trace-core.js（NF opus/w7）と同じ決まりで作る（同じ台帳・同じ並び）。
import type { LedgerLens, LedgerNaics, LedgerStore } from "./ledger-store.js";
import {
  STEP_PART,
  TRACE_STEP_IDS,
  type ModelPort,
  type ModelRoute,
  type Trace,
  type TraceEvent,
  type TraceItem,
  type TraceStep,
  type TraceStepId,
} from "./types.js";

export const STEP_TITLES: Record<TraceStepId, string> = {
  S01_words: "言葉の印",
  S02_expert_terms: "達人の言葉",
  S03_position: "今いる所",
  S04_industry: "業種",
  S05_cells: "要るマス",
  S06_lens: "達人のレンズ",
  S07_orgs: "トップの組織",
  S08_exemplars: "手本",
  S09_latest: "最新の動き",
  S10_route: "道筋",
  S11_essence: "本質の確認",
  S12_alternatives: "別の道",
  S13_prereq: "前提の鎖",
  S14_next: "次の一手",
};

/** 台帳だけで出す段（オフラインでも出る） */
export const LEDGER_STEPS: readonly TraceStepId[] = ["S04_industry", "S05_cells", "S06_lens", "S12_alternatives", "S13_prereq"];
/** モデルで作る段（鍵があり、つながっている時だけ） */
export const MODEL_STEPS: readonly TraceStepId[] = ["S10_route", "S11_essence", "S14_next"];

const LEDGER_MISSING: Partial<Record<TraceStepId, string>> = {
  S01_words: "台帳に曖昧な言葉の表がまだありません（Fable v8.2 待ち）",
  S02_expert_terms: "台帳に言葉の橋がまだありません（Fable v8.2 待ち）",
  S03_position: "現在地の推定はモデルの段です（まだつないでいません）",
  S07_orgs: "台帳に組織のプロフィールがまだありません（Fable v10 待ち）",
  S08_exemplars: "台帳に手本がまだありません（Fable v10 待ち）",
  S09_latest: "出せる最新の動きがありません（ニュースの読み口は W2・まとめ役がつなぐ）",
};
const LEDGER_HINT = "Fable v8.1 の座標系とレンズ（仮のデータ）";

export type ModelAvailability = "ok" | "no_key" | "offline";

export interface OfflineTraceDeps {
  store: LedgerStore;
  /** 鍵がありつながっている時だけ渡す */
  model?: ModelPort;
  /** model が無い理由（画面の「出せなかった」の文に使う） */
  modelState?: ModelAvailability;
  modelKey?: string;
  now?: () => Date;
  newId?: () => string;
}

function bigrams(s: string): Set<string> {
  const t = s.replace(/[\s（）()・、。「」]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 1 < t.length; i += 1) out.add(t.slice(i, i + 2));
  return out;
}

export interface Classified {
  n: LedgerNaics;
  score: number;
  hits: string[];
  role: "主" | "従";
}

/** 部品 4（台帳だけ）: 手がかりの言葉・題の重なり・FTS の一致で NAICS を当てる（主 1・従 2 まで） */
export function classify(sentence: string, store: LedgerStore): Classified[] {
  const sb = bigrams(sentence);
  const fts = new Map(store.search(sentence, { kinds: ["naics"], k: 10 }).map((h) => [h.id, h.score]));
  const scored: Omit<Classified, "role">[] = [];
  for (const n of store.naicsAll()) {
    const hits = n.words.filter((w) => sentence.includes(w));
    let score = hits.length * 3 + (fts.has(n.code) ? 2 : 0);
    for (const g of bigrams(n.title_ja)) if (sb.has(g)) score += 1;
    if (score > 0) scored.push({ n, score, hits });
  }
  scored.sort((a, b) => b.score - a.score || a.n.code.localeCompare(b.n.code));
  return scored.slice(0, 3).map((x, i) => ({ ...x, role: i === 0 ? "主" : "従" }));
}

function step(id: TraceStepId, status: TraceStep["status"], items: TraceItem[], extra?: Partial<TraceStep>): TraceStep {
  return { id, title: STEP_TITLES[id], part: STEP_PART[id], status, items, ...extra };
}

function est(text: string, hints: string[], more?: Partial<TraceItem>): TraceItem {
  return { text, sources: [], confidence: "低", estimated: true, hints, ...more };
}

export function ledgerSteps(sentence: string, store: LedgerStore) {
  const cls = classify(sentence, store);
  const lensById = new Map(store.lenses().map((l) => [l.id, l] as const));
  const verbs = new Map(store.verbs().map((v) => [v.id, v] as const));
  const layers = new Map(store.layers().map((l) => [l.id, l] as const));
  const lenses: LedgerLens[] = [];
  const seen = new Set<string>();
  for (const c of cls) {
    for (const id of c.n.lens_ids) {
      const l = lensById.get(id);
      if (l && !seen.has(id)) {
        seen.add(id);
        lenses.push(l);
      }
    }
  }
  const out: Partial<Record<TraceStepId, TraceStep>> = {};

  out.S04_industry = cls.length
    ? step(
        "S04_industry",
        "ok",
        cls.map((c) => ({
          text: `${c.role}: ${c.n.code} ${c.n.title_ja}（${c.n.title}）`,
          sources: [c.n.source],
          confidence: "低",
          estimated: true,
          hints: c.hits.length ? [`言葉の手がかり: ${c.hits.join("・")}`] : ["題の言葉の重なり"],
        })),
      )
    : step("S04_industry", "failed", [], { failed_reason: "台帳の見本の業種に当てはまる手がかりがありませんでした" });

  const cells: TraceItem[] = [];
  const cellSeen = new Set<string>();
  for (const l of lenses) {
    const v = verbs.get(l.verb);
    if (!v) continue;
    for (const lid of v.critical_layers.slice(0, 2)) {
      const ly = layers.get(lid);
      if (!ly || cellSeen.has(v.id + lid)) continue;
      cellSeen.add(v.id + lid);
      cells.push(est(`${v.name} × ${ly.name}: ${ly.looks_at}`, [LEDGER_HINT], { cell: { verb: v.id, layer: lid } }));
    }
  }
  out.S05_cells = cells.length
    ? step("S05_cells", "ok", cells.slice(0, 6))
    : step("S05_cells", "failed", [], { failed_reason: "業種が当たらないのでマスを選べませんでした" });

  out.S06_lens = lenses.length
    ? step(
        "S06_lens",
        "ok",
        lenses.map((l) =>
          est(l.name, [LEDGER_HINT], l.regulated.length ? { expert_check: l.regulated.map((r) => `${r}: 専門家に確かめる点があります`) } : {}),
        ),
      )
    : step("S06_lens", "failed", [], { failed_reason: "業種が当たらないのでレンズを出せませんでした" });

  const usedVerbs = new Set(lenses.flatMap((l) => l.verbs));
  const alts = store
    .lenses()
    .filter((l) => !seen.has(l.id) && l.verbs.some((v) => usedVerbs.has(v)))
    .slice(0, 3)
    .map((l) => est(`${l.name} — 同じ「${verbs.get(l.verb)?.name ?? l.verb}」を、別の分野の達人がどう組むかを見る`, [LEDGER_HINT, "同じ動詞のほかの分野"]));
  out.S12_alternatives = alts.length
    ? step("S12_alternatives", "ok", alts)
    : step("S12_alternatives", "failed", [], { failed_reason: "台帳だけでは別の道を出せませんでした" });

  const pre: TraceItem[] = [];
  for (const t of store.prereqTopics().filter((t) => t.lens_ids.some((id) => seen.has(id))).slice(0, 2)) {
    pre.push(est(`「${t.target_action}」の前に通る所`, [LEDGER_HINT], { terms: t.must_include_paths.slice(0, 4) }));
  }
  for (const l of lenses.slice(0, 2)) {
    const v = verbs.get(l.verb);
    const ly = v ? layers.get(v.critical_layers[0] ?? "") : undefined;
    if (ly?.beginner_gap) pre.push(est(`${ly.name}: 初めての人は「${ly.beginner_gap}」で詰まりやすい`, [LEDGER_HINT]));
  }
  out.S13_prereq = pre.length
    ? step("S13_prereq", "ok", pre)
    : step("S13_prereq", "failed", [], { failed_reason: "台帳に当てはまる前提の題がありませんでした" });

  return { steps: out, cls, lenses };
}

function modelPrompt(sentence: string, cls: Classified[], lenses: LedgerLens[]): string {
  return [
    "次の相談に、道筋（中間地点を3つ）・本質の確認（1文）・次の一手（1文）を JSON で返してください。",
    '形: {"route":["…","…","…"],"essence":"…","next":"…"}。数字は出典が無いなら書かない。',
    `相談: ${sentence}`,
    `業種（台帳の見当）: ${cls.map((c) => `${c.n.code} ${c.n.title_ja}`).join("、") || "不明"}`,
    `レンズ: ${lenses.map((l) => l.name).join("、") || "不明"}`,
  ].join("\n");
}

interface ModelOut {
  route: string[];
  essence?: string;
  next?: string;
}

function parseModel(text: string): ModelOut {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new Error("モデルの答えが決まった形ではありませんでした");
  const j = JSON.parse(m[0]) as Partial<ModelOut>;
  if (!Array.isArray(j.route)) throw new Error("モデルの答えに route がありません");
  return { route: j.route.map(String), essence: j.essence, next: j.next };
}

const NO_MODEL: Record<ModelAvailability, string> = {
  ok: "",
  no_key: "鍵が無いので、モデルの要る段は出していません（キーチェーンに利用者の鍵を入れると出ます）",
  offline: "オフラインなので、モデルの要る段は出していません（台帳の段は出ています）",
};

/** buildTrace の代役（端末の台帳＋鍵がある時だけモデル） */
export async function* buildOfflineTrace(req: { sentence: string }, deps: OfflineTraceDeps): AsyncGenerator<TraceEvent> {
  const now = () => (deps.now ? deps.now() : new Date());
  const sentence = String(req.sentence ?? "").slice(0, 4000);
  const trace_id = deps.newId ? deps.newId() : crypto.randomUUID();
  const t0 = Date.now();
  const depth = { depth: 5 as const, source: "default" as const, history: [] };
  const route: ModelRoute | null = deps.model && deps.modelKey ? { model_key: deps.modelKey, reason: "user_choice" } : null;
  yield { type: "start", trace_id, at: now().toISOString(), depth, route };
  const ver = deps.store.version();
  if (!ver) throw new Error("端末の台帳がまだ取り込まれていません");
  if (ver.provisional) yield { type: "notice", kind: "provisional_data", text: "仮のデータです（台帳の見本・Fable v8.1 の抜き出し）" };
  if (deps.modelState === "offline") yield { type: "notice", kind: "stale_data", text: "オフラインです。端末の台帳だけで出しています" };

  const { steps: led, cls, lenses } = ledgerSteps(sentence, deps.store);
  let out: ModelOut | null = null;
  let err: string | null = null;
  const usage = { input_tokens: 0, output_tokens: 0, ms: 0, model: null as string | null };
  if (route && deps.model) {
    try {
      const r = await deps.model.call({ model_key: route.model_key, prompt: modelPrompt(sentence, cls, lenses), max_tokens: 600, json: true });
      usage.input_tokens = r.usage.input_tokens;
      usage.output_tokens = r.usage.output_tokens;
      usage.model = r.model;
      out = parseModel(r.text);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
  }
  const mhint = usage.model ? [`利用者のモデル ${usage.model} の答え（出典なし）`] : [];
  const steps: TraceStep[] = [];
  for (const id of TRACE_STEP_IDS) {
    let s: TraceStep;
    const fromLedger = led[id];
    if (fromLedger) s = fromLedger;
    else if (MODEL_STEPS.includes(id)) {
      if (!route) s = step(id, "failed", [], { failed_reason: NO_MODEL[deps.modelState ?? "no_key"] || NO_MODEL.no_key });
      else if (err || !out) s = step(id, "failed", [], { failed_reason: `モデルの段を出せませんでした: ${err ?? "答えが空"}` });
      else if (id === "S10_route") s = step(id, "ok", out.route.slice(0, 5).map((t) => est(t, mhint)));
      else if (id === "S11_essence") s = step(id, "ok", out.essence ? [est(String(out.essence), mhint)] : []);
      else s = step(id, "ok", out.next ? [est(String(out.next), mhint)] : []);
    } else s = step(id, "failed", [], { failed_reason: LEDGER_MISSING[id] ?? "出せませんでした" });
    steps.push(s);
    yield { type: "step", step: s };
  }
  usage.ms = Date.now() - t0;
  yield { type: "usage", ...usage };
  const trace: Trace = {
    trace_id,
    created_at: now().toISOString(),
    user_sentence: sentence,
    depth,
    route,
    steps,
    usage,
    data_updated_at: ver.imported_at,
    safety: { blocked: false, reasons: [], domain: null, expert_check_points: [] },
  };
  yield { type: "done", trace };
}
