// NF 検品 — 記録の鎖（端末内のみ）。本文は保存しない。自由記述になり得る欄は
// 念のため scrubPii を通す（拡張と同じ決まり）。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { kensanRecordsPath } from "./deps-real.js";
import { scrubPii } from "./pii.js";

export type KensanRecord = {
  at: string;
  task_id: string;
  task_name: string;
  mode: "selection" | "clipboard";
  chars: number;
  truncated: boolean;
  note?: string;
  not_confirmed: string;
};

export async function appendRecord(
  record: KensanRecord,
  recordsPath: string = kensanRecordsPath(),
): Promise<number> {
  let records: KensanRecord[] = [];
  try {
    const raw = await readFile(recordsPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) records = parsed as KensanRecord[];
  } catch {
    records = [];
  }
  const safe: KensanRecord = {
    ...record,
    task_name: scrubPii(record.task_name).text,
    note: record.note ? scrubPii(record.note).text : undefined,
  };
  records.push(safe);
  await mkdir(path.dirname(recordsPath), { recursive: true });
  await writeFile(recordsPath, JSON.stringify(records, null, 2), "utf8");
  return records.length;
}
