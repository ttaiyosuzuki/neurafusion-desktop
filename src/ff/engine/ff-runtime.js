// @ts-nocheck
// 取り込み元: neurafusion-171268ee 1325961b の engine/ff（build.mjs で作ったバンドル）。手で直さない。
// 取り込み: bash scripts/nf-ff/sync-engine.sh <repo> origin/opus/ff-engine
// engine/schema/validate.ts
var PII_PATTERNS = [
  { name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: "phone_jp", re: /(?<!\d)0\d{1,4}[-(（ ]?\d{1,4}[-)） ]?\d{3,4}(?!\d)/ },
  { name: "number12", re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/ },
  { name: "postal_jp", re: /〒?\s?\d{3}-\d{4}/ }
];
function collectStrings(value, out) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
}
function maskHexRuns(s) {
  return s.replace(/[0-9a-fA-F]{16,}/g, "h");
}
var ENGINE_SHORT_HASH = /(?<![0-9A-Za-z])(?:(?:h|out):[0-9a-f]{8}|[0-9a-f]{8}>[0-9a-f]{8})(?![0-9A-Za-z])/g;
function maskEngineShortHashes(s) {
  return s.replace(ENGINE_SHORT_HASH, "h");
}
function findPii(trace) {
  const strings = [];
  collectStrings(trace, strings);
  const hits = [];
  for (const s of strings) {
    const masked = maskHexRuns(maskEngineShortHashes(s));
    for (const p of PII_PATTERNS) if (p.re.test(masked)) hits.push(p.name);
  }
  return [...new Set(hits)];
}

// engine/ff/foresee.ts
var ORDER2_SEP = " >> ";
function stateKeys(recent) {
  const n = recent.length;
  const keys = [];
  if (n >= 2) keys.push(`${recent[n - 2]}${ORDER2_SEP}${recent[n - 1]}`);
  if (n >= 1) keys.push(recent[n - 1]);
  return keys;
}
function tableOf(index) {
  const t = index.table;
  return t && typeof t === "object" ? t : {};
}
var ACTION_JA = {
  probe: "\u554F\u3044\u76F4\u3059",
  reject: "\u6368\u3066\u308B",
  choose: "\u9078\u3076",
  edit: "\u76F4\u3059",
  artifact: "\u6210\u679C\u7269\u3092\u51FA\u3059"
};
function labelOf(token) {
  const [action = "", verb = "", slot = "-", , tool = ""] = token.split("|");
  const head = ACTION_JA[action] ?? action;
  const parts = [head];
  if (verb && verb !== "-") parts.push(verb);
  let s = parts.join("\uFF1A");
  if (slot && slot !== "-") s += `\uFF08${slot}\uFF09`;
  if (tool) s += ` [${tool}]`;
  return s;
}
function makeMove(row, at) {
  if (!Number.isInteger(row.support_n) || row.support_n < 1) return null;
  if (!Array.isArray(row.trace_refs) || row.trace_refs.length === 0) return null;
  return {
    step: at.step,
    token: row.token,
    label: labelOf(row.token),
    support_n: row.support_n,
    trace_refs: [...row.trace_refs],
    branch: at.branch,
    depth: at.depth
  };
}
function stateTokens(state) {
  if (state.recent_tokens.length > 0) return [...state.recent_tokens];
  return state.last_edit ? [state.last_edit] : [];
}
function candidates(table, recent, exclude) {
  for (const key of stateKeys(recent)) {
    const rows = (table[key] ?? []).filter((r) => r.support_n >= 1 && r.trace_refs.length > 0 && !exclude.has(r.token));
    if (rows.length > 0) {
      return [...rows].sort((a, b) => b.support_n - a.support_n || a.token.localeCompare(b.token));
    }
  }
  return [];
}
function branchCount(state, index) {
  return candidates(tableOf(index), stateTokens(state), new Set(state.rejected)).length;
}
async function* foresee(state, index, opts) {
  const k = opts.k;
  if (!(k >= 3 && k <= 5)) throw new Error(`FF: k \u306F 3\u301C5\uFF08${k}\uFF09`);
  const recent = stateTokens(state);
  if (recent.length === 0) {
    yield { type: "none", reason: "no_state" };
    return;
  }
  const table = tableOf(index);
  const rejected = new Set(state.rejected);
  const first = candidates(table, recent, rejected)[opts.branch];
  if (!first) {
    yield { type: "none", reason: "no_record" };
    return;
  }
  const from = opts.depth * k;
  const to = from + k;
  const path = [...recent];
  const seen = /* @__PURE__ */ new Set([first.token]);
  let row = first;
  let yielded = 0;
  for (let pos = 0; row && pos < to; pos++) {
    if (pos >= from) {
      const m = makeMove(row, { step: pos + 1, branch: opts.branch, depth: opts.depth });
      if (!m) break;
      yield { type: "move", move: m };
      yielded++;
    }
    path.push(row.token);
    row = candidates(table, path, /* @__PURE__ */ new Set([...rejected, ...seen]))[0];
    if (row) seen.add(row.token);
  }
  if (yielded === 0) {
    yield { type: "none", reason: "no_record" };
    return;
  }
  yield { type: "done" };
}
function nextPress(state, index, cur, k) {
  const deeper = { depth: cur.depth + 1, branch: cur.branch };
  if (hasMove(state, index, deeper, k)) return deeper;
  const other = { depth: 0, branch: cur.branch + 1 };
  if (other.branch < branchCount(state, index)) return other;
  return null;
}
function hasMove(state, index, cur, k) {
  const recent = stateTokens(state);
  if (recent.length === 0) return false;
  const table = tableOf(index);
  const rejected = new Set(state.rejected);
  let row = candidates(table, recent, rejected)[cur.branch];
  const path = [...recent];
  const seen = new Set(row ? [row.token] : []);
  for (let pos = 0; row; pos++) {
    if (pos >= cur.depth * k) return true;
    path.push(row.token);
    row = candidates(table, path, /* @__PURE__ */ new Set([...rejected, ...seen]))[0];
    if (row) seen.add(row.token);
  }
  return false;
}
var HEADER = {
  openclaw: "\u6B21\u306E\u624B\u9806\u3067\u9032\u3081\u3066\u304F\u3060\u3055\u3044\u3002",
  "claude-code": "Please carry out the following steps in order (\u6B21\u306E\u624B\u9806\u3067\u9032\u3081\u3066\u304F\u3060\u3055\u3044):",
  cursor: "\u6B21\u306E\u624B\u9806\u3067\u9032\u3081\u3066\u304F\u3060\u3055\u3044\uFF08Cursor\uFF09:",
  generic: "\u6B21\u306E\u624B\u9806\u3067\u9032\u3081\u3066\u304F\u3060\u3055\u3044\u3002"
};
function lineOf(target, i, m) {
  const body = `${m.label}\uFF08\u5B9F\u5728\u306E\u8A18\u9332 N=${m.support_n}\uFF09`;
  switch (target) {
    case "claude-code":
      return `- [ ] ${i + 1}. ${body}`;
    case "cursor":
      return `- ${body}`;
    default:
      return `${i + 1}. ${body}`;
  }
}
function toInstruction(path, target) {
  if (path.length === 0) throw new Error("FF: \u9053\u7B4B\u304C\u7A7A\uFF08\u5B9F\u5728\u306E\u8A18\u9332\u304C\u7121\u3044\u624B\u306F\u6E21\u3055\u306A\u3044\uFF09");
  const ordered = [...path].sort((a, b) => a.step - b.step);
  const lines = ordered.map((m, i) => {
    const l = lineOf(target, i, m);
    return findPii(l).length > 0 ? lineOf(target, i, { ...m, label: "\uFF08\u4F0F\u305B\u307E\u3057\u305F: \u500B\u4EBA\u60C5\u5831\u306E\u7591\u3044\uFF09" }) : l;
  });
  const foot = target === "claude-code" ? "\u5404\u624B\u306F NEURA FUSION \u306E\u5148\u8AAD\u307F\uFF08\u540C\u3058\u72B6\u614B\u304B\u3089\u5B9F\u969B\u306B\u6253\u305F\u308C\u305F\u624B\uFF09\u3067\u3059\u3002\u5B9F\u884C\u3059\u308B\u304B\u3069\u3046\u304B\u306F\u3042\u306A\u305F\u304C\u6C7A\u3081\u3066\u304F\u3060\u3055\u3044\u3002" : "\u203B NEURA FUSION \u306E\u5148\u8AAD\u307F\uFF08\u540C\u3058\u72B6\u614B\u304B\u3089\u5B9F\u969B\u306B\u6253\u305F\u308C\u305F\u624B\uFF09\u3067\u3059\u3002NEURA FUSION \u306F\u64CD\u4F5C\u3092\u5B9F\u884C\u3057\u307E\u305B\u3093\u3002";
  const out = [HEADER[target], ...lines, foot].join("\n");
  if (findPii(out).length > 0) throw new Error("FF: \u6307\u793A\u6587\u306B\u500B\u4EBA\u60C5\u5831\u306E\u7591\u3044\u304C\u6B8B\u3063\u305F");
  return out;
}

// engine/ff/events.ts
var FF_GRADE = { shown: 1, viewed_until_stop: 2, adopted: 3 };
var KINDS = ["shown", "next", "branch", "adopt", "stop", "dismiss"];
function normalizeEvent(raw) {
  const e = raw;
  if (!e || typeof e !== "object") return null;
  if (!KINDS.includes(e.kind)) return null;
  if (typeof e.at !== "number" || typeof e.session !== "string" || typeof e.state_pattern !== "string") return null;
  if (!Array.isArray(e.moves)) return null;
  const moves = e.moves.filter((m) => m && typeof m.token === "string" && typeof m.step === "number").map((m) => ({ step: m.step, token: m.token, branch: m.branch ?? 0, depth: m.depth ?? 0, support_n: m.support_n }));
  const out = { kind: e.kind, at: e.at, session: e.session, state_pattern: e.state_pattern, moves };
  if (typeof e.upto_step === "number") out.upto_step = e.upto_step;
  return out;
}
function eventToJsonl(e) {
  const n = normalizeEvent(e);
  if (!n) throw new Error("FF: \u8A18\u9332\u306E\u5F62\u304C\u9055\u3046");
  return JSON.stringify(n);
}
function movesForEvent(moves) {
  return moves.map((m) => ({ step: m.step, token: m.token, branch: m.branch, depth: m.depth, support_n: m.support_n }));
}
function toTeacher(events) {
  const best = /* @__PURE__ */ new Map();
  const sorted = [...events].sort((a, b) => a.at - b.at || a.session.localeCompare(b.session));
  const shownBySession = /* @__PURE__ */ new Map();
  const keyOf = (s, m) => `${s}\0${m.branch}\0${m.depth}\0${m.step}\0${m.token}`;
  const put = (session, sp, m, grade, stage) => {
    const k = keyOf(session, m);
    const cur = best.get(k);
    const rank = { shown: 0, clicked: 1, adopted: 2 };
    if (!cur || grade > cur.grade || grade === cur.grade && rank[stage] > rank[cur.stage]) {
      best.set(k, { session, state_pattern: sp, token: m.token, step: m.step, branch: m.branch, depth: m.depth, grade, stage });
    }
  };
  for (const e of sorted) {
    const seen = shownBySession.get(e.session) ?? /* @__PURE__ */ new Map();
    for (const m of e.moves) seen.set(keyOf(e.session, m), { ...m, state_pattern: e.state_pattern });
    shownBySession.set(e.session, seen);
    const stage = e.kind === "next" || e.kind === "branch" ? "clicked" : "shown";
    for (const m of e.moves) put(e.session, e.state_pattern, m, FF_GRADE.shown, stage);
    if ((e.kind === "stop" || e.kind === "adopt") && typeof e.upto_step === "number") {
      const grade = e.kind === "adopt" ? FF_GRADE.adopted : FF_GRADE.viewed_until_stop;
      const st = e.kind === "adopt" ? "adopted" : "shown";
      const pool = e.moves.length > 0 ? e.moves.map((m) => ({ ...m, state_pattern: e.state_pattern })) : [...seen.values()];
      const branch = pool.length > 0 ? pool[pool.length - 1].branch : 0;
      for (const m of pool) if (m.branch === branch && m.step <= e.upto_step) put(e.session, m.state_pattern, m, grade, st);
    }
  }
  return [...best.values()].sort(
    (a, b) => a.session.localeCompare(b.session) || a.branch - b.branch || a.step - b.step || a.token.localeCompare(b.token)
  );
}
function toRkRows(rows) {
  return {
    head: "p_execute",
    label_kind: "ff-adopt",
    rows: rows.map((r) => ({
      impression_id: `${r.session}#${r.branch}.${r.depth}`,
      intent_id: r.state_pattern,
      candidate_id: r.token,
      position: r.step,
      y: r.grade === FF_GRADE.adopted ? 1 : 0,
      gain: r.grade,
      weight: 1
    }))
  };
}

// engine/ff/keys.ts
var FF_KEYS = {
  "version": 2,
  "note": "FF \u5148\u8AAD\u307F\u306E\u65E2\u5B9A\u30AD\u30FC\u30023\u9762\uFF08\u62E1\u5F35\u30FB\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u30FBWeb\uFF09\u3067\u540C\u3058\u65E2\u5B9A\u3002\u2318+P / Ctrl+P \u306F\u4F7F\u308F\u306A\u3044\u3002\u885D\u7A81\u8868\u306F engine/ff/README.md\u3002\u8A2D\u5B9A\u3067\u5909\u3048\u305F\u30AD\u30FC\u306F\u5404\u9762\u306E\u8A2D\u5B9A\u306B\u4FDD\u5B58\u3059\u308B\u3002v2: trigger \u3092 Alt+Shift+Period \u304B\u3089 Alt+Shift+Comma \u306B\u5909\u66F4\uFF08VS Code/Cursor \u306E Auto Fix \u304C Windows\u30FBLinux \u3067 Alt+Shift+. \u3092\u4F7F\u3046\u3002microsoft/vscode codeActionCommands.ts \u3067\u78BA\u8A8D\uFF09\u3002",
  "actions": {
    "trigger": {
      "label": "\u5148\u8AAD\u307F\uFF08\u3082\u3046\u4E00\u5EA6\u62BC\u3059\u3068\u3001\u3055\u3089\u306B\u5148\uFF0F\u5225\u306E\u679D\uFF09",
      "scope": "global",
      "chrome_command": "nf-ff-trigger",
      "chrome": {
        "default": "Alt+Shift+Comma",
        "mac": "Alt+Shift+Comma"
      },
      "mac": "Option+Shift+,",
      "windows": "Alt+Shift+,",
      "linux": "Alt+Shift+,",
      "electron": "Alt+Shift+,"
    },
    "adopt": {
      "label": "\u3053\u308C\u3067\u884C\u304F\uFF08\u6307\u793A\u6587\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u3078\uFF09",
      "scope": "overlay-only",
      "scope_note": "\u884C\u3092\u8868\u793A\u3057\u3066\u3044\u308B\u3042\u3044\u3060\u3060\u3051\u52B9\u304B\u305B\u308B\u3002Chrome \u306E commands \u306B\u306F\u767B\u9332\u3057\u306A\u3044\uFF08\u5E38\u6642\u306B\u306A\u3063\u3066\u3057\u307E\u3046\u305F\u3081\u3002\u62E1\u5F35\u306F content script \u306E keydown \u3067\u8868\u793A\u4E2D\u3060\u3051\u53D7\u3051\u308B\uFF09\u3002\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u306F\u8868\u793A\u4E2D\u3060\u3051\u5168\u4F53\u30AD\u30FC\u306B\u767B\u9332\u3057\u3001\u9589\u3058\u305F\u3089\u5916\u3059\u3002\u8868\u793A\u4E2D\u306F VS Code/Cursor \u306E Auto Fix\uFF08Windows\u30FBLinux \u306E Alt+Shift+.\uFF09\u3088\u308A\u5148\u306B\u53D6\u308B\u3002",
      "chrome_command": null,
      "chrome": null,
      "mac": "Option+Shift+.",
      "windows": "Alt+Shift+.",
      "linux": "Alt+Shift+.",
      "electron": "Alt+Shift+."
    },
    "close": {
      "label": "\u9589\u3058\u308B",
      "scope": "overlay-only",
      "scope_note": "\u8868\u793A\u4E2D\u3060\u3051\u52B9\u304F\u3002Chrome \u306E commands \u306B\u306F\u767B\u9332\u3057\u306A\u3044\uFF08content script \u306E keydown\uFF09\u3002\u30C7\u30B9\u30AF\u30C8\u30C3\u30D7\u306F\u8868\u793A\u4E2D\u3060\u3051\u767B\u9332\u3059\u308B\u3002",
      "chrome_command": null,
      "chrome": null,
      "mac": "Escape",
      "windows": "Escape",
      "linux": "Escape",
      "electron": "Escape"
    }
  },
  "trigger_again": {
    "same_key": true,
    "rule": "\u8868\u793A\u4E2D\u306B trigger \u3092\u3082\u3046\u4E00\u5EA6\u62BC\u3059\u3068 depth+1\uFF08\u3055\u3089\u306B\u5148\uFF09\u3002\u305D\u306E\u5148\u306B\u5B9F\u5728\u306E\u8A18\u9332\u304C\u7121\u3051\u308C\u3070 depth \u3092 0 \u306B\u623B\u3057\u3066 branch+1\uFF08\u5225\u306E\u679D\uFF09\u3002\u679D\u3082\u5C3D\u304D\u305F\u3089 { type: 'none', reason: 'no_record' }\u3002engine/ff/foresee.ts nextPress\u3002"
  },
  "existing_nf_keys": [
    "Alt+Shift+N",
    "Ctrl+Shift+9",
    "Command+Shift+9"
  ],
  "forbidden": [
    "Command+P",
    "Ctrl+P"
  ]
};

// engine/ff/runtime-entry.ts
var FF_EMPTY_INDEX = { kind: "ff-index", version: 1, mode: "production", sources: [], table: {}, stats: { states: 0, transitions: 0 } };
export {
  FF_EMPTY_INDEX,
  FF_GRADE,
  FF_KEYS,
  branchCount,
  eventToJsonl,
  foresee,
  labelOf,
  movesForEvent,
  nextPress,
  normalizeEvent,
  stateKeys,
  toInstruction,
  toRkRows,
  toTeacher
};
