// NF 検品 — パネル（自己完結のローカル HTML を生成して既定ブラウザで開く）。
// 外部スクリプト・外部フォント・外部画像は読まない。中身は Chrome 拡張のパネルと同じ流儀:
//   判定されたタスク／読み取った範囲／必須項目（埋まり具合）／足りない項目を聞く／
//   契約書・検算／検品なしで通るか（サーバ未実装＝判定：準備中で Yes は出さない）／記録

import type { CaptureResult } from "./capture.js";
import type { DetectResult, KensanField } from "./detect.js";
import { queryNoReviewPass, sendForReview } from "./server-gate.js";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildAskPrompt(name: string, missing: KensanField[]): string {
  const head = `【NF 検品】${name}\n\nこの会話でやりたいことを「${name}」と読み取りました。`;
  if (missing.length === 0) {
    return `${head}\n\n必要な項目は一通り埋まっているように見えます。抜けている観点があれば指摘してください。`;
  }
  const list = missing.map((m) => `・${m.label}`).join("\n");
  return (
    `${head}\n\nまだ埋まっていない項目が ${missing.length} 件あります。\n${list}\n\n` +
    `この会話の中から拾えるものだけ埋めてください。\n` +
    `会話に出ていないものは「不明」と書いてください。推測では埋めないでください。\n` +
    `埋まらなかった項目は、何を聞けば分かるかを1行で添えてください。`
  );
}

export type PanelInput = {
  capture: CaptureResult;
  detect: DetectResult;
  fields: KensanField[];
  recordCount: number | null;
};

function describeScope(capture: CaptureResult): string {
  const base =
    capture.mode === "selection"
      ? `選んだ文字 ${capture.text.length} 字だけを読み取りました`
      : `コピーした文字 ${capture.text.length} 字だけを読み取りました`;
  const cut = capture.truncated ? "（上限16,000字で打ち切り）" : "";
  return base + cut;
}

/** 自己完結のパネル HTML を組み立てる。 */
export function buildPanelHtml(input: PanelInput): string {
  const { capture, detect, fields, recordCount } = input;
  const scope = describeScope(capture);
  const noteLine = capture.note ? `<p class="sub">${esc(capture.note)}</p>` : "";

  let body = "";
  if (detect.id === "unknown") {
    body = `
    <div class="sec">
      <h3>どうすればよいか</h3>
      <p>どのタスクか特定できませんでした。もう少し具体的な語（相続・決算・消費税 など）を含む部分を選んでから、もう一度実行してください。推測では埋めません。</p>
    </div>`;
  } else {
    const missing = fields.filter((f) => f.kind === "ask");
    const fieldRows =
      fields.length === 0
        ? `<p class="sub">このタスクの必須項目は準備中です。</p>`
        : fields
            .map((f) => {
              const hint =
                f.kind === "document"
                  ? "書類から取ります（お聞きしません）"
                  : f.kind === "we_determine"
                    ? "当社で決めます（お聞きしません）"
                    : (f.ask ?? "");
              const input =
                f.kind === "ask"
                  ? `<input type="text" class="ask" placeholder="分からなければ空欄のままで">`
                  : `<input type="text" disabled>`;
              return `<div class="fld"><div class="lab">${esc(f.label)}</div><div class="hint">${esc(hint)}</div>${input}</div>`;
            })
            .join("");
    const fill =
      missing.length > 0
        ? `<p class="sub" data-nf="fill-status" id="nf-fill"></p>`
        : "";
    const verdict = queryNoReviewPass(detect.id);
    const verdictExtra =
      verdict.status === "pending"
        ? `<p class="sub">判定エンジン（サーバ）が未実装のため、まだ判定できません。実装されるまで Yes（人の確認なしで進められる）は表示しません。</p>`
        : `<p class="sub">${esc(verdict.status === "no" ? verdict.text : "")}</p>`;
    const sample = detect.task?.sample_check_task
      ? esc(detect.task.sample_check_task)
      : "検算タスクは準備中です。";
    body = `
    <div class="sec">
      <h3>必須項目</h3>
      <p class="guard">埋まっていない項目は推測では埋めません。</p>
      ${fieldRows}
      ${fill}
    </div>
    <div class="sec">
      <h3>足りない項目を聞く（お使いのAIチャットに貼ってください）</h3>
      <textarea readonly rows="8" id="nf-ask">${esc(buildAskPrompt(detect.name, missing))}</textarea>
      <button type="button" class="btn" id="nf-select-all">全選択（⌘/Ctrl+C でコピー）</button>
      <p class="guard">貼るところまでです。送信はご本人が行ってください。</p>
    </div>
    <div class="sec">
      <h3>検算タスク（5〜20分）</h3>
      <p class="sub">${sample}</p>
    </div>
    <div class="sec">
      <h3>検品なしで通るか</h3>
      <p class="task" data-nf="no-review-verdict" data-nf-verdict="${verdict.status}">${esc(verdict.label)}</p>
      ${verdictExtra}
      <button type="button" class="btn" disabled data-nf="server-review">オンライン検品に出す（準備中）</button>
      <p class="guard">${esc(sendForReview(null).note)} 実装されるまで、合格（Yes）の表示は出しません。</p>
    </div>`;
  }

  const recordLine =
    recordCount === null
      ? "記録の保存に失敗しました。"
      : `この確認は端末内の記録に追記済みです（この端末だけ・通算 ${recordCount} 件）。`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NF 検品</title>
<style>
  body { margin:0; padding:16px; background:#f4f5f7; color:#1f2328;
         font-family:"Hiragino Sans","Yu Gothic","Noto Sans JP",system-ui,sans-serif;
         font-size:13px; line-height:1.7; }
  @media (prefers-color-scheme: dark) {
    body { background:#1b1e23; color:#ecedee; }
    .sec { background:#2a2f36 !important; border-color:#3a4048 !important; }
    input, textarea { background:#1b1e23 !important; color:#ecedee !important; border-color:#3a4048 !important; }
    .warn { background:#3a3120 !important; border-color:#d99a53 !important; }
  }
  .wrap { max-width:560px; margin:0 auto; }
  h1 { font-size:15px; display:flex; align-items:center; gap:8px; }
  .warn { background:#fff6e5; border:1px solid #e3b341; border-radius:6px; padding:8px 10px; font-size:11px; }
  .sec { border:1px solid #d8dde3; border-radius:8px; padding:10px 12px; margin:10px 0; background:#fff; }
  .sec h3 { margin:0 0 6px; font-size:11px; color:#5b6470; font-weight:600; }
  .task { font-size:15px; font-weight:600; margin:2px 0; }
  .sub { font-size:11px; color:#5b6470; }
  .guard { font-size:10px; color:#5b6470; font-style:italic; }
  .fld { padding:7px 0; border-bottom:1px dashed #d8dde3; }
  .fld:last-of-type { border-bottom:none; }
  .fld .lab { font-size:12px; font-weight:500; }
  .fld .hint { font-size:10px; color:#5b6470; margin:1px 0 3px; }
  input, textarea { width:100%; padding:5px 7px; border:1px solid #d8dde3; border-radius:5px; font-size:12px; font-family:inherit; box-sizing:border-box; }
  .btn { border:1px solid #d8dde3; background:#fff; padding:6px 10px; border-radius:6px; cursor:pointer; font-size:12px; margin-top:6px; }
  .btn:disabled { opacity:.55; cursor:not-allowed; }
</style>
</head>
<body>
<div class="wrap">
  <h1>NF 検品</h1>
  <p class="warn">この答えは合っているかもしれないし、間違っているかもしれません。</p>
  <div class="sec">
    <h3>判定されたタスク</h3>
    <p class="task">${esc(detect.name)}</p>
    <p class="sub">キーワードの一致数 ${detect.hits}</p>
    <p class="sub" data-nf="scope">${esc(scope)}</p>
    ${noteLine}
  </div>
  ${body}
  <div class="sec">
    <h3>記録</h3>
    <p class="sub">${esc(recordLine)}</p>
    <p class="sub">読み取った本文そのものは保存していません。外部への送信はありません。</p>
  </div>
</div>
<script>
  (function () {
    var asks = Array.prototype.slice.call(document.querySelectorAll("input.ask"));
    var fill = document.getElementById("nf-fill");
    function update() {
      if (!fill || asks.length === 0) return;
      var filled = asks.filter(function (i) { return i.value.trim() !== ""; }).length;
      fill.textContent = "埋まり具合: " + filled + " / " + asks.length +
        (filled < asks.length ? "（未入力 " + (asks.length - filled) + " 件・推測では埋めません）" : "（すべて入力済み）");
    }
    asks.forEach(function (i) { i.addEventListener("input", update); });
    update();
    var sel = document.getElementById("nf-select-all");
    if (sel) sel.addEventListener("click", function () {
      var ta = document.getElementById("nf-ask");
      if (ta) { ta.focus(); ta.select(); }
    });
  })();
</script>
</body>
</html>`;
}
