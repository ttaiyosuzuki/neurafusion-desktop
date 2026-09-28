// NF 検品 — 53業務のタスク判定（Chrome 拡張 content_script.js の detectTask と同じ規則）。
// キーワードの一致数だけで判定する純関数。LLM は呼ばない＝同じ入力なら同じ答え。
// 一致数が min_hits（既定2）に満たなければ「判定できません」で止まる（Fail Closed）。

import { KENSAN_REQUIRED_FIELDS } from "./data/required-fields.js";
import { KENSAN_TASKS } from "./data/tasks.js";

export type KensanTask = {
  id: string;
  name: string;
  keywords?: readonly string[];
  min_hits?: number;
  contract_url?: string;
  checklist_url?: string;
  sample_check_task?: string;
};

export type KensanField = {
  id?: string;
  label: string;
  kind: "ask" | "document" | "we_determine" | string;
  ask?: string | null;
};

export type DetectResult = {
  id: string;
  name: string;
  hits: number;
  task?: KensanTask;
};

/** 同梱の53業務辞書（外部通信なし）。 */
export function loadTasks(): readonly KensanTask[] {
  return KENSAN_TASKS.tasks as readonly KensanTask[];
}

/** 同梱の必須項目定義。 */
export function loadRequiredFields(): Record<string, KensanField[]> {
  return KENSAN_REQUIRED_FIELDS as Record<string, KensanField[]>;
}

/** キーワード一致数だけでタスクを1つ選ぶ。閾値未満は「判定できません」。 */
export function detectTask(text: string, tasks?: readonly KensanTask[]): DetectResult {
  const list = tasks ?? loadTasks();
  if (!Array.isArray(list) || !text) return { id: "unknown", name: "判定できません", hits: 0 };
  let best: KensanTask | null = null;
  let bestHits = 0;
  for (const task of list) {
    let hits = 0;
    for (const kw of task.keywords ?? []) if (kw && text.includes(kw)) hits += 1;
    if (hits > bestHits) {
      bestHits = hits;
      best = task;
    }
  }
  if (!best || bestHits < (best.min_hits ?? 2)) {
    return { id: "unknown", name: "判定できません", hits: bestHits };
  }
  return { id: best.id, name: best.name, hits: bestHits, task: best };
}
