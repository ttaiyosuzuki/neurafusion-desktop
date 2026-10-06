// v7 OP-09c 道筋（デスクトップ）の入口: オフラインの判定と表示・鍵（キーチェーン）がある時だけのモデル・台帳の段。
// 宛先は PROVIDERS の 3 つだけ。送る前に個人情報らしいもの（メール・番号・電話・郵便番号）を伏せ字にする。
// 鍵の値は返り値・エラー・表示の文に入れない。本物の API はテストでは呼ばない（fetch と lookup は偽物）。
import { lookup as dnsLookup } from "node:dns/promises";
import type { SecretStore } from "./keychain.js";
import type { LedgerStore } from "./ledger-store.js";
import { buildOfflineTrace, type ModelAvailability } from "./offline-trace.js";
import type { ModelCall, ModelPort, ModelResult, TraceEvent } from "./types.js";

export const PROVIDERS = {
  anthropic: { host: "api.anthropic.com", label: "Anthropic" },
  openai: { host: "api.openai.com", label: "OpenAI" },
  google: { host: "generativelanguage.googleapis.com", label: "Google" },
} as const;
export type Provider = keyof typeof PROVIDERS;

/** 利用者の選び（鍵ではない・ファイルに置いてよい） */
export interface TraceModelChoice {
  provider: Provider;
  model: string;
}

/** 拡張の pii.js と同じ決まり（識別子だけを伏せ字に） */
const PII_RULES: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[メール伏せ字]"],
  [/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,4}\b/g, "[番号伏せ字]"],
  [/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[番号伏せ字]"],
  [/(?<!\d)0\d{1,4}[-(（ ]?\d{1,4}[-)） ]?\d{3,4}(?!\d)/g, "[電話伏せ字]"],
  [/〒?\s?\d{3}-\d{4}/g, "[郵便番号伏せ字]"],
];
export function scrub(text: string): string {
  let out = text;
  for (const [re, mask] of PII_RULES) out = out.replace(re, mask);
  return out;
}

export type Lookup = (host: string) => Promise<unknown>;

/** オフラインの判定: 宛先の名前が引けるか（上限つき）。モデルを使わない時は台帳だけなので判定しない */
export async function isOnline(host: string, opts: { lookup?: Lookup; timeoutMs?: number } = {}): Promise<boolean> {
  const look = opts.lookup ?? ((h: string) => dnsLookup(h));
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      look(host).then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), opts.timeoutMs ?? 1500);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

/** 利用者の鍵で利用者の契約のモデルを呼ぶ ModelPort（鍵は呼ぶたびにキーチェーンから読み、持ち続けない） */
export function keychainModelPort(choice: TraceModelChoice, keychain: SecretStore, fetchImpl: FetchLike = fetch as unknown as FetchLike): ModelPort {
  return {
    async call(req: ModelCall): Promise<ModelResult> {
      const key = await keychain.get(choice.provider);
      if (!key) throw new Error("鍵がありません");
      const max = Math.max(1, Math.min(4000, req.max_tokens || 600));
      const prompt = scrub(req.prompt);
      const system = req.system ? scrub(req.system) : "";
      const t0 = Date.now();
      let url: string;
      let headers: Record<string, string>;
      let body: unknown;
      if (choice.provider === "anthropic") {
        url = "https://api.anthropic.com/v1/messages";
        headers = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
        body = { model: choice.model, max_tokens: max, ...(system ? { system } : {}), messages: [{ role: "user", content: prompt }] };
      } else if (choice.provider === "openai") {
        url = "https://api.openai.com/v1/chat/completions";
        headers = { "content-type": "application/json", authorization: `Bearer ${key}` };
        body = { model: choice.model, max_completion_tokens: max, messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }] };
      } else {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(choice.model)}:generateContent`;
        headers = { "content-type": "application/json", "x-goog-api-key": key };
        body = {
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: max },
        };
      }
      const res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`${PROVIDERS[choice.provider].label} の API が ${res.status} を返しました`);
      const j = (await res.json()) as Record<string, any>;
      let text = "";
      let usage = { input_tokens: 0, output_tokens: 0 };
      let model = choice.model;
      if (choice.provider === "anthropic") {
        text = ((j.content as { type: string; text?: string }[]) ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
        usage = { input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0 };
        model = j.model ?? model;
      } else if (choice.provider === "openai") {
        text = j.choices?.[0]?.message?.content ?? "";
        usage = { input_tokens: j.usage?.prompt_tokens ?? 0, output_tokens: j.usage?.completion_tokens ?? 0 };
        model = j.model ?? model;
      } else {
        text = ((j.candidates?.[0]?.content?.parts as { text?: string }[]) ?? []).map((p) => p.text ?? "").join("");
        usage = { input_tokens: j.usageMetadata?.promptTokenCount ?? 0, output_tokens: j.usageMetadata?.candidatesTokenCount ?? 0 };
        model = j.modelVersion ?? model;
      }
      return { text, model, usage, ms: Date.now() - t0 };
    },
  };
}

export interface TraceStatus {
  online: boolean | null;
  hasKey: boolean;
  modelState: ModelAvailability;
  /** 画面に出す一言（鍵の値は入らない） */
  label: string;
}

/** 今の状態（オフライン・鍵の有無）を見て、画面の一言を作る */
export async function traceStatus(
  choice: TraceModelChoice | null,
  keychain: SecretStore | null,
  opts: { lookup?: Lookup; timeoutMs?: number } = {},
): Promise<TraceStatus> {
  const hasKey = !!(choice && keychain && (await keychain.get(choice.provider)));
  if (!choice || !hasKey) {
    return { online: null, hasKey: false, modelState: "no_key", label: "鍵なし: 端末の台帳だけで 業種・マス・レンズ・別の道・前提の鎖 まで出します" };
  }
  const online = await isOnline(PROVIDERS[choice.provider].host, opts);
  if (!online) {
    return { online: false, hasKey: true, modelState: "offline", label: "オフライン: 端末の台帳だけで出します（モデルの段はつながったら出ます）" };
  }
  return { online: true, hasKey: true, modelState: "ok", label: `${PROVIDERS[choice.provider].label} の ${choice.model}（利用者の鍵）でモデルの段も出します` };
}

/** 道筋を 1 回作る（状態を見て、使える段だけ） */
export async function* runDesktopTrace(
  sentence: string,
  deps: {
    store: LedgerStore;
    choice: TraceModelChoice | null;
    keychain: SecretStore | null;
    lookup?: Lookup;
    fetch?: FetchLike;
    now?: () => Date;
  },
): AsyncGenerator<TraceEvent> {
  const st = await traceStatus(deps.choice, deps.keychain, { lookup: deps.lookup });
  const model = st.modelState === "ok" && deps.choice && deps.keychain ? keychainModelPort(deps.choice, deps.keychain, deps.fetch) : undefined;
  yield* buildOfflineTrace(
    { sentence },
    { store: deps.store, model, modelKey: deps.choice?.model, modelState: st.modelState, now: deps.now },
  );
}
