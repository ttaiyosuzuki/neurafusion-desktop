// NF 検品（デスクトップ入口）の自動テスト — 指示 D-01〜D-05 に対応:
//   D-01 選択文字の取り込み
//   D-02 読み取り範囲が選択文字を超えない（他の読み口に触れない・上限で打ち切る）
//   D-03 許可なしのときの「コピーしてから押す」への切り替え（確認は初回の1回だけ）
//   D-04 取り込んだ文字の扱いは拡張と同じ（PII除去・サーバ未実装は準備中で Yes を出さない）

import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  AxNotAuthorizedError,
  captureText,
  KENSAN_TEXT_LIMIT,
  type CaptureDeps,
  type KensanState,
} from "./capture.js";
import { detectTask, loadRequiredFields, loadTasks } from "./detect.js";
import { scrubPii } from "./pii.js";
import { runKensanPanel } from "./runner.js";
import { queryNoReviewPass, sendForReview, SERVER_SEND } from "./server-gate.js";

const INHERITANCE_TEXT =
  "相続税の申告について。遺産の総額と基礎控除を比べ、法定相続人は2人です。申告が必要か知りたい。";

type FakeDeps = CaptureDeps & {
  calls: { readClipboard: number; writeClipboard: number; simulateCopy: number };
  state: KensanState;
};

function makeDeps(overrides?: {
  platform?: NodeJS.Platform;
  clipboard?: string;
  simulate?: "ok" | "denied";
  afterCopyClipboard?: string;
  state?: KensanState;
}): FakeDeps {
  const calls = { readClipboard: 0, writeClipboard: 0, simulateCopy: 0 };
  let clipboard = overrides?.clipboard ?? "";
  const deps: FakeDeps = {
    calls,
    state: { ...(overrides?.state ?? {}) },
    platform: overrides?.platform ?? "darwin",
    readClipboard: async () => {
      calls.readClipboard += 1;
      return clipboard;
    },
    writeClipboard: async (t) => {
      calls.writeClipboard += 1;
      clipboard = t;
    },
    simulateCopy: async () => {
      calls.simulateCopy += 1;
      if (overrides?.simulate === "denied") throw new AxNotAuthorizedError();
      clipboard = overrides?.afterCopyClipboard ?? "";
    },
    delay: async () => {},
    loadState: async () => ({ ...deps.state }),
    saveState: async (s) => {
      deps.state = { ...s };
    },
  };
  return deps;
}

describe("D-01 選択文字の取り込み", () => {
  it("渡された選択文字をそのまま取り込む（selection モード）", async () => {
    const deps = makeDeps();
    const r = await captureText({ selectionText: INHERITANCE_TEXT }, deps);
    expect(r.mode).toBe("selection");
    expect(r.text).toBe(INHERITANCE_TEXT);
    expect(r.truncated).toBe(false);
  });

  it("53業務辞書が同梱されており、選択文字から判定できる", () => {
    expect(loadTasks().length).toBe(53);
    expect(Object.keys(loadRequiredFields()).length).toBe(53);
    const hit = detectTask(INHERITANCE_TEXT);
    expect(hit.id).not.toBe("unknown");
    expect(hit.hits).toBeGreaterThanOrEqual(2);
  });
});

describe("D-02 読み取り範囲が選択文字を超えない", () => {
  it("選択文字があるときは、クリップボードにも⌘C合成にも一切触れない", async () => {
    const deps = makeDeps({ clipboard: "これは読まれてはいけないクリップボードの中身" });
    const r = await captureText({ selectionText: INHERITANCE_TEXT }, deps);
    expect(deps.calls.readClipboard).toBe(0);
    expect(deps.calls.simulateCopy).toBe(0);
    expect(r.text).not.toContain("クリップボードの中身");
  });

  it("上限16,000字で打ち切る（それ以上は読まない）", async () => {
    const deps = makeDeps();
    const r = await captureText({ selectionText: "あ".repeat(20000) }, deps);
    expect(r.text.length).toBe(KENSAN_TEXT_LIMIT);
    expect(r.truncated).toBe(true);
  });

  it("パネルに出るのも取り込んだ文字の範囲だけ（記録にも本文は残らない）", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nf-kensan-test-"));
    const recordsPath = path.join(dir, "records.json");
    const outFile = path.join(dir, "panel.html");
    const deps = makeDeps({ clipboard: "読まれてはいけない別の文" });
    const result = await runKensanPanel({
      selectionText: INHERITANCE_TEXT,
      open: false,
      deps,
      recordsPath,
      outFile,
    });
    expect(deps.calls.readClipboard).toBe(0);
    expect(result.capture.text.length).toBeLessThanOrEqual(INHERITANCE_TEXT.length);
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(outFile, "utf8");
    expect(html).toContain(`選んだ文字 ${INHERITANCE_TEXT.length} 字だけを読み取りました`);
    expect(html).not.toContain("読まれてはいけない別の文");
    const records = JSON.parse(await readFile(recordsPath, "utf8"));
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records)).not.toContain("法定相続人は2人");
    expect(records[0].chars).toBe(INHERITANCE_TEXT.length);
  });
});

describe("D-03 許可なしのときの切り替え（確認は初回の1回だけ）", () => {
  it("許可があれば⌘C合成で選択を取り、元のクリップボードを復元する", async () => {
    const deps = makeDeps({ clipboard: "元の中身", simulate: "ok", afterCopyClipboard: INHERITANCE_TEXT });
    const r = await captureText({}, deps);
    expect(r.mode).toBe("selection");
    expect(r.text).toBe(INHERITANCE_TEXT);
    expect(deps.calls.writeClipboard).toBe(1); // 元の中身を書き戻した
  });

  it("拒否されたら「コピーしてから押す」方式に切り替え、その旨を注記する", async () => {
    const deps = makeDeps({ clipboard: "コピー済みの本文 相続 遺産", simulate: "denied" });
    const r = await captureText({}, deps);
    expect(r.mode).toBe("clipboard");
    expect(r.text).toContain("コピー済みの本文");
    expect(r.note).toContain("コピーしてから押す");
    expect(deps.state.axDenied).toBe(true);
  });

  it("2回目以降は確認（⌘C合成の試行）をせず、直ちにコピー方式で動く", async () => {
    const deps = makeDeps({ clipboard: "コピー済み", simulate: "denied", state: { axAsked: true, axDenied: true } });
    const r = await captureText({}, deps);
    expect(deps.calls.simulateCopy).toBe(0); // もう確認を出さない
    expect(r.mode).toBe("clipboard");
  });

  it("--from-clipboard 指定ではクリップボードだけを読む", async () => {
    const deps = makeDeps({ clipboard: "コピーした文" });
    const r = await captureText({ fromClipboard: true }, deps);
    expect(r.mode).toBe("clipboard");
    expect(deps.calls.simulateCopy).toBe(0);
  });
});

describe("D-04 取り込んだ文字の扱いは拡張と同じ", () => {
  it("PII除去: メール・電話・12桁番号・郵便番号が伏せ字になる", () => {
    const s = "連絡先は taro@example.com、電話は 090-1234-5678、番号は 1234 5678 9012、〒150-0001 です。";
    const out = scrubPii(s);
    expect(out.text).not.toContain("taro@example.com");
    expect(out.text).not.toContain("090-1234-5678");
    expect(out.text).not.toContain("1234 5678 9012");
    expect(out.text).not.toContain("150-0001");
    expect(out.maskedCount).toBeGreaterThanOrEqual(4);
  });

  it("サーバ未実装の間は「準備中」で、Yes は絶対に出さない", async () => {
    expect(SERVER_SEND.enabled).toBe(false);
    expect(sendForReview({ any: 1 }).status).toBe("準備中");
    expect(queryNoReviewPass("inheritance_tax").status).toBe("pending");

    const dir = await mkdtemp(path.join(os.tmpdir(), "nf-kensan-test-"));
    const outFile = path.join(dir, "panel.html");
    await runKensanPanel({
      selectionText: INHERITANCE_TEXT,
      open: false,
      deps: makeDeps(),
      recordsPath: path.join(dir, "records.json"),
      outFile,
    });
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(outFile, "utf8");
    expect(html).toContain("判定：準備中");
    expect(html).toContain('data-nf-verdict="pending"');
    expect(html).not.toContain("無修正で通っています");
    expect(html).not.toContain("人の確認なしで進められます");
  });

  it("判定できないときは止まり、必須項目・検算・検品判定を出さない", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "nf-kensan-test-"));
    const outFile = path.join(dir, "panel.html");
    const r = await runKensanPanel({
      selectionText: "今日はいい天気ですね。散歩に行きます。",
      open: false,
      deps: makeDeps(),
      recordsPath: path.join(dir, "records.json"),
      outFile,
    });
    expect(r.detect.id).toBe("unknown");
    const { readFile } = await import("node:fs/promises");
    const html = await readFile(outFile, "utf8");
    expect(html).toContain("判定できません");
    expect(html).toContain("どうすればよいか");
    expect(html).not.toContain("必須項目");
    expect(html).not.toContain("検算タスク");
    expect(html).not.toContain("検品なしで通るか");
  });
});
