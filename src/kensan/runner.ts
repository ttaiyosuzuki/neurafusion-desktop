// NF 検品 — 取り込み→判定→記録→パネル生成→ブラウザで開く、の一連。

import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  captureText,
  type CaptureDeps,
  type CaptureInput,
  type CaptureResult,
} from "./capture.js";
import { realCaptureDeps } from "./deps-real.js";
import { detectTask, loadRequiredFields, type DetectResult } from "./detect.js";
import { buildPanelHtml } from "./panel-html.js";
import { appendRecord } from "./records.js";

export type PanelRunResult = {
  htmlPath: string;
  capture: CaptureResult;
  detect: DetectResult;
  recordCount: number | null;
};

export type PanelRunOptions = CaptureInput & {
  /** 生成した HTML を既定ブラウザで開く（テストでは false） */
  open?: boolean;
  deps?: CaptureDeps;
  recordsPath?: string;
  /** 出力先（省略時は一時ディレクトリ） */
  outFile?: string;
};

function openInBrowser(file: string): void {
  const p = process.platform;
  if (p === "darwin") execFile("open", [file], () => {});
  else if (p === "win32") execFile("cmd", ["/c", "start", "", file], () => {});
  else execFile("xdg-open", [file], () => {});
}

export async function runKensanPanel(opts: PanelRunOptions): Promise<PanelRunResult> {
  const deps = opts.deps ?? realCaptureDeps();
  const capture = await captureText(
    { selectionText: opts.selectionText, fromClipboard: opts.fromClipboard },
    deps,
  );
  const detect = detectTask(capture.text);
  const fields = detect.id === "unknown" ? [] : (loadRequiredFields()[detect.id] ?? []);

  let recordCount: number | null = null;
  if (capture.text.trim().length > 0) {
    try {
      recordCount = await appendRecord(
        {
          at: new Date().toISOString(),
          task_id: detect.id,
          task_name: detect.name,
          mode: capture.mode,
          chars: capture.text.length,
          truncated: capture.truncated,
          note: capture.note,
          not_confirmed: "取り込んだ文字（選択またはコピー）以外の全部",
        },
        opts.recordsPath,
      );
    } catch {
      recordCount = null;
    }
  }

  const html = buildPanelHtml({ capture, detect, fields, recordCount });
  let htmlPath = opts.outFile ?? "";
  if (!htmlPath) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nf-kensan-"));
    htmlPath = path.join(dir, "panel.html");
  }
  await writeFile(htmlPath, html, "utf8");
  if (opts.open !== false) openInBrowser(htmlPath);
  return { htmlPath, capture, detect, recordCount };
}

/** stdin を最後まで読む（macOS の Quick Action からの選択文字受け取り）。 */
export async function readAllStdin(stream: NodeJS.ReadableStream = process.stdin): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}
