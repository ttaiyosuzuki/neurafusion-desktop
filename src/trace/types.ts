// v7 OP-09c 道筋（デスクトップ）の形。NF リポジトリの共通の型 engine/trace/types.ts（opus/v7・まとめ役だけが変える）の
// 使う所だけの写し。名前と形は同じにしてある（本物の buildTrace・mountTraceView をつなぐ時に、そのまま渡せるように）。
// 本物を取り込む時は、このファイルを NF の engine/trace/types.ts の生成物に置き換える（まとめ役）。

export type Confidence = "高" | "中" | "低";
export type SourceKind = "論文" | "公式資料" | "決算" | "ニュース" | "経験者の声";
export type Depth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface SourceRef {
  url: string;
  title?: string;
  kind: SourceKind;
  as_of?: string;
  retrieved_at?: string;
}

export const TRACE_STEP_IDS = [
  "S01_words",
  "S02_expert_terms",
  "S03_position",
  "S04_industry",
  "S05_cells",
  "S06_lens",
  "S07_orgs",
  "S08_exemplars",
  "S09_latest",
  "S10_route",
  "S11_essence",
  "S12_alternatives",
  "S13_prereq",
  "S14_next",
] as const;
export type TraceStepId = (typeof TRACE_STEP_IDS)[number];

export type PartId =
  | "mark_vague"
  | "expand_terms"
  | "estimate_position"
  | "classify_naics"
  | "select_cells"
  | "fetch_lens"
  | "fetch_latest"
  | "build_route"
  | "prereq_chain"
  | "trim_depth"
  | "assemble";

export const STEP_PART: Record<TraceStepId, PartId> = {
  S01_words: "mark_vague",
  S02_expert_terms: "expand_terms",
  S03_position: "estimate_position",
  S04_industry: "classify_naics",
  S05_cells: "select_cells",
  S06_lens: "fetch_lens",
  S07_orgs: "fetch_lens",
  S08_exemplars: "fetch_lens",
  S09_latest: "fetch_latest",
  S10_route: "build_route",
  S11_essence: "build_route",
  S12_alternatives: "build_route",
  S13_prereq: "prereq_chain",
  S14_next: "build_route",
};

export interface TraceItem {
  text: string;
  sources: SourceRef[];
  confidence: Confidence;
  estimated: boolean;
  hints?: string[];
  cell?: { verb: string; layer: string };
  terms?: string[];
  expert_check?: string[];
  org_id?: string;
}

export interface TraceStep {
  id: TraceStepId;
  title: string;
  part: PartId;
  status: "ok" | "failed" | "cut";
  items: TraceItem[];
  failed_reason?: string;
  needs_model?: { prompt: string; input: unknown };
  ms?: number;
}

export interface ModelCall {
  model_key: string;
  system?: string;
  prompt: string;
  max_tokens: number;
  json?: boolean;
  signal?: AbortSignal;
}

export interface ModelResult {
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  ms: number;
}

export interface ModelPort {
  call(req: ModelCall): Promise<ModelResult>;
}

export interface ModelRoute {
  model_key: string;
  reason: "user_choice" | "high_precision" | "depth_8_plus" | "cheap_bulk";
  depth_lowered_to?: Depth;
  notice?: string;
}

export interface DepthState {
  depth: Depth;
  source: "default" | "predicted" | "setting";
  history: { at: string; from: Depth; to: Depth; why: string }[];
}

export interface SafetyResult {
  blocked: boolean;
  reasons: string[];
  domain: "medical" | "legal" | "money" | null;
  expert_check_points: string[];
}

export interface Trace {
  trace_id: string;
  created_at: string;
  user_sentence: string;
  depth: DepthState;
  route: ModelRoute | null;
  steps: TraceStep[];
  usage: { input_tokens: number; output_tokens: number; ms: number; model: string | null };
  data_updated_at: string | null;
  safety: SafetyResult;
}

export type TraceEvent =
  | { type: "start"; trace_id: string; at: string; depth: DepthState; route: ModelRoute | null }
  | { type: "step"; step: TraceStep }
  | {
      type: "notice";
      kind: "depth_lowered" | "budget" | "stale_data" | "safety" | "provisional_data";
      text: string;
    }
  | { type: "usage"; input_tokens: number; output_tokens: number; ms: number; model: string | null }
  | { type: "done"; trace: Trace };
