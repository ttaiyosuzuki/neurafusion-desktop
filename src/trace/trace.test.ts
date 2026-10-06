// v7 OP-09c のテスト。本物のモデル・外部 API・本物のキーチェーンは使わない（fetch・lookup・Runner は偽物）。
import { describe, expect, it } from "vitest";
import { KEYCHAIN_SERVICE, keychainFor, windowsScript, type Runner, type SecretStore } from "./keychain.js";
import { checkLedgerJson, LedgerStore, SAMPLE_LEDGER_PATH, type LedgerJson } from "./ledger-store.js";
import { LEDGER_STEPS, MODEL_STEPS } from "./offline-trace.js";
import { isOnline, keychainModelPort, runDesktopTrace, scrub, traceStatus } from "./session.js";
import { TRACE_STEP_IDS, type TraceEvent, type TraceStep } from "./types.js";
import { readFileSync } from "node:fs";

const SAMPLE = JSON.parse(readFileSync(SAMPLE_LEDGER_PATH, "utf8")) as LedgerJson;
const FAKE_KEY = "fake-key-ABCDEFGH-0123";

function store(): LedgerStore {
  const s = LedgerStore.open(":memory:");
  const r = s.importJson(SAMPLE, new Date("2026-10-06T00:00:00Z"));
  expect(r.ok).toBe(true);
  return s;
}

function memKeychain(init: Record<string, string> = {}): SecretStore & { data: Record<string, string> } {
  const data = { ...init };
  return {
    kind: "macos-keychain",
    data,
    get: async (a) => data[a] ?? null,
    set: async (a, s) => void (data[a] = s),
    delete: async (a) => void delete data[a],
  };
}

async function collect(it: AsyncIterable<TraceEvent>): Promise<TraceEvent[]> {
  const out: TraceEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}
const stepsOf = (ev: TraceEvent[]) =>
  Object.fromEntries(ev.flatMap((e) => (e.type === "step" ? [[e.step.id, e.step] as const] : []))) as Record<string, TraceStep>;

const offline = async () => {
  throw new Error("ENOTFOUND");
};
const online = async () => ({ address: "127.0.0.1" });

describe("端末の台帳（node:sqlite）", () => {
  it("見本を取り込み、版・取得元・仮の印を持つ。前の版に戻せる", () => {
    const s = store();
    expect(s.version()).toMatchObject({ version: 1, source: SAMPLE.source, provisional: true });
    expect(s.verbs()).toHaveLength(14);
    expect(s.layers()).toHaveLength(22);
    expect(s.naicsAll().length).toBe(SAMPLE.naics.length);
    const r2 = s.importJson(SAMPLE, new Date("2026-10-07T00:00:00Z"));
    expect(r2).toEqual({ ok: true, version: 2 });
    expect(s.rollback()).toBe(1);
    expect(s.version()?.imported_at).toBe("2026-10-06T00:00:00.000Z");
    s.close();
  });

  it("形の合わない台帳は取り込まず、何が合わないかを返す", () => {
    const s = LedgerStore.open(":memory:");
    const bad = { ...SAMPLE, naics: [{ ...SAMPLE.naics[0]!, code: "12", lens_ids: ["nope"] }] };
    const r = s.importJson(bad);
    expect(r.ok).toBe(false);
    expect(checkLedgerJson(bad).join("\n")).toMatch(/6 桁ではない[\s\S]*レンズ nope が無い/);
    expect(s.version()).toBeNull();
  });

  it("索引（FTS5 trigram）で言葉の一致を探せる", () => {
    const s = store();
    const hits = s.search("ベーカリーを始めたい", { kinds: ["naics"], k: 3 });
    expect(hits[0]?.id).toBe("311811");
  });
});

describe("オフラインの道筋（OP-09c）", () => {
  it("鍵なし: 台帳だけで 業種・マス・レンズ・別の道・前提の鎖 まで出し、モデルの段は「鍵が無い」", async () => {
    const ev = await collect(runDesktopTrace("パン屋を開いて、地域の人にもっと来てもらいたい", { store: store(), choice: null, keychain: null }));
    const by = stepsOf(ev);
    expect(ev.filter((e) => e.type === "step").map((e) => (e as { step: TraceStep }).step.id)).toEqual([...TRACE_STEP_IDS]);
    for (const id of LEDGER_STEPS) expect(by[id]?.status, id).toBe("ok");
    for (const id of MODEL_STEPS) expect(by[id]?.failed_reason).toMatch(/鍵が無い/);
    expect(by.S04_industry?.items[0]?.text).toMatch(/^主: 311811 /);
    expect(by.S04_industry?.items[0]?.sources[0]?.url).toMatch(/^https:\/\/www\.census\.gov\/naics\//);
    expect(ev.some((e) => e.type === "notice" && e.kind === "provisional_data")).toBe(true);
    const done = ev.at(-1);
    expect(done?.type).toBe("done");
  });

  it("鍵あり・オフライン: 名前が引けない → モデルを呼ばず、台帳の段は出て「オフライン」と出る", async () => {
    let fetched = 0;
    const kc = memKeychain({ anthropic: FAKE_KEY });
    const ev = await collect(
      runDesktopTrace("パン屋の集客", {
        store: store(),
        choice: { provider: "anthropic", model: "fake-model" },
        keychain: kc,
        lookup: offline,
        fetch: async () => {
          fetched += 1;
          throw new Error("呼ばない");
        },
      }),
    );
    expect(fetched).toBe(0);
    const by = stepsOf(ev);
    expect(by.S04_industry?.status).toBe("ok");
    expect(by.S10_route?.failed_reason).toMatch(/オフライン/);
    expect(ev.some((e) => e.type === "notice" && /オフライン/.test(e.text))).toBe(true);
    expect(JSON.stringify(ev)).not.toContain(FAKE_KEY);
  });

  it("鍵あり・つながる（偽物の fetch）: モデルの段が出る・送る文は伏せ字・鍵は出力に出ない", async () => {
    const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
    const kc = memKeychain({ openai: FAKE_KEY });
    const ev = await collect(
      runDesktopTrace("パン屋の集客 連絡は taro@example.com へ", {
        store: store(),
        choice: { provider: "openai", model: "fake-model" },
        keychain: kc,
        lookup: online,
        fetch: async (url, init) => {
          sent.push({ url, body: init.body, headers: init.headers });
          return {
            ok: true,
            status: 200,
            json: async () => ({
              model: "fake-model",
              choices: [{ message: { content: '{"route":["a","b","c"],"essence":"e","next":"n"}' } }],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            }),
          };
        },
      }),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(sent[0]?.body).not.toContain("taro@example.com");
    expect(sent[0]?.body).not.toContain(FAKE_KEY);
    expect(sent[0]?.headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    const by = stepsOf(ev);
    expect(by.S10_route?.status).toBe("ok");
    expect(by.S10_route?.items.map((i) => i.text)).toEqual(["a", "b", "c"]);
    expect(by.S10_route?.items[0]?.estimated).toBe(true);
    expect(JSON.stringify(ev)).not.toContain(FAKE_KEY);
  });

  it("モデルが失敗しても（401）残りの段は出る・エラーの文に相手の本文と鍵を入れない", async () => {
    const kc = memKeychain({ google: FAKE_KEY });
    const ev = await collect(
      runDesktopTrace("動画を作って売りたい", {
        store: store(),
        choice: { provider: "google", model: "g-1" },
        keychain: kc,
        lookup: online,
        fetch: async () => ({ ok: false, status: 401, json: async () => ({ error: "secret detail" }) }),
      }),
    );
    const by = stepsOf(ev);
    expect(by.S04_industry?.status).toBe("ok");
    expect(by.S10_route?.failed_reason).toMatch(/401/);
    expect(JSON.stringify(ev)).not.toMatch(/secret detail|fake-key/);
  });
});

describe("状態の表示", () => {
  it("鍵なし／オフライン／つながる の一言（鍵の値は入らない）", async () => {
    expect((await traceStatus(null, null)).label).toMatch(/^鍵なし/);
    const kc = memKeychain({ anthropic: FAKE_KEY });
    const off = await traceStatus({ provider: "anthropic", model: "m" }, kc, { lookup: offline });
    expect(off).toMatchObject({ online: false, modelState: "offline" });
    expect(off.label).toMatch(/^オフライン/);
    const on = await traceStatus({ provider: "anthropic", model: "m" }, kc, { lookup: online });
    expect(on.modelState).toBe("ok");
    expect(JSON.stringify([off, on])).not.toContain(FAKE_KEY);
    expect(await isOnline("x", { lookup: () => new Promise(() => {}), timeoutMs: 20 })).toBe(false);
  });

  it("伏せ字（拡張の pii.js と同じ決まり）", () => {
    expect(scrub("taro@example.com 03-1234-5678 〒100-0001")).toBe("[メール伏せ字] [電話伏せ字] [郵便番号伏せ字]");
  });
});

describe("OS のキーチェーン（Runner は偽物）", () => {
  function fakeRunner(script: (cmd: string, args: string[], input?: string) => { code: number; stdout: string }) {
    const calls: { cmd: string; args: string[]; input?: string }[] = [];
    const run: Runner = async (cmd, args, input) => {
      calls.push({ cmd, args, input });
      return script(cmd, args, input);
    };
    return { run, calls };
  }

  it("macOS: 書く時は security -i に標準入力で渡す（鍵は引数に乗らない）・読む・消す", async () => {
    const saved: Record<string, string> = {};
    const { run, calls } = fakeRunner((cmd, args, input) => {
      if (args[0] === "-i") {
        const m = /-a "([^"]+)".*-w "([^"]+)"/.exec(input ?? "");
        if (m) saved[m[1]!] = m[2]!;
        return { code: 0, stdout: "" };
      }
      if (args[0] === "find-generic-password") {
        const a = args[args.indexOf("-a") + 1]!;
        return saved[a] ? { code: 0, stdout: saved[a] + "\n" } : { code: 44, stdout: "" };
      }
      return { code: 0, stdout: "" };
    });
    const kc = keychainFor("darwin", run)!;
    expect(kc.kind).toBe("macos-keychain");
    expect(await kc.get("anthropic")).toBeNull();
    await kc.set("anthropic", FAKE_KEY);
    expect(await kc.get("anthropic")).toBe(FAKE_KEY);
    await kc.delete("anthropic");
    for (const c of calls) {
      expect(c.cmd).toBe("/usr/bin/security");
      expect(c.args.join(" ")).not.toContain(FAKE_KEY);
      expect(c.args).toContain(c.args[0] === "-i" ? "-i" : KEYCHAIN_SERVICE);
    }
    expect(calls.find((c) => c.args[0] === "-i")?.input).toContain(`-s "${KEYCHAIN_SERVICE}"`);
    expect(calls.at(-1)?.args[0]).toBe("delete-generic-password");
  });

  it("Linux: secret-tool store は標準入力で鍵を受ける／Windows: PowerShell の手順は標準入力・鍵は base64", async () => {
    const { run, calls } = fakeRunner(() => ({ code: 0, stdout: FAKE_KEY }));
    const lx = keychainFor("linux", run)!;
    await lx.set("openai", FAKE_KEY);
    expect(await lx.get("openai")).toBe(FAKE_KEY);
    expect(calls[0]).toMatchObject({ cmd: "secret-tool", input: FAKE_KEY });
    expect(calls[0]?.args).toEqual(["store", "--label=NeuraFusion 道筋", "service", KEYCHAIN_SERVICE, "account", "openai"]);

    const w = fakeRunner(() => ({ code: 0, stdout: "" }));
    const win = keychainFor("win32", w.run)!;
    await win.set("google", FAKE_KEY);
    expect(w.calls[0]?.cmd).toBe("powershell.exe");
    expect(w.calls[0]?.args).toEqual(["-NoProfile", "-NonInteractive", "-Command", "-"]);
    expect(w.calls[0]?.input).not.toContain(FAKE_KEY);
    expect(w.calls[0]?.input).toContain(Buffer.from(FAKE_KEY).toString("base64"));
    expect(windowsScript("get", "t")).toMatch(/CredRead/);
    expect(keychainFor("aix", run)).toBeNull();
  });

  it("鍵の形を確かめる（引用符・空白・短すぎは保存しない＝命令の文を壊さない）", async () => {
    const { run, calls } = fakeRunner(() => ({ code: 0, stdout: "" }));
    const kc = keychainFor("darwin", run)!;
    await expect(kc.set("anthropic", 'abc"; rm -rf ~')).rejects.toThrow(/決まりに合いません/);
    await expect(kc.set("anthropic", "short")).rejects.toThrow(/決まりに合いません/);
    await expect(kc.set("Bad Name", FAKE_KEY)).rejects.toThrow(/決まりに合いません/);
    expect(calls).toHaveLength(0);
  });

  it("keychainModelPort: 鍵が無ければ呼ばない", async () => {
    const port = keychainModelPort({ provider: "anthropic", model: "m" }, memKeychain(), async () => {
      throw new Error("呼ばない");
    });
    await expect(port.call({ model_key: "m", prompt: "x", max_tokens: 10 })).rejects.toThrow(/鍵がありません/);
  });
});
