// FF「先読み」— キー1つ分の動き（FF-02〜06）。ネイティブから ff-key を受け、ff-line / ff-hide を返す。
//
//  押す（trigger・表示なし）→ 今の状態を読み、エンジンの foresee の手を1行ずつ流す（1行目は届いたらすぐ・2行目から間を置く）
//  もう一度押す（trigger・表示中）→ engine の nextPress（さらに先。尽きたら別の枝）
//  これで行く（adopt・表示中）→ ここまでに出た手の道筋を指示文にしてクリップボードへ（設定があれば OpenClaw の入力欄へも）
//  閉じる（close・表示中だけ）／しばらく触らない → 閉じる
//
// 表示していないときの adopt・close は何もしない（押すまで何も出さない・お知らせを出さない: FF-06）。
// 手はエンジンの表を引いた物だけ。ここで手を作らない（実在の記録が無ければ「記録なし」の1行だけ）。

import type { FfEvent, FfEventKind, FfIndexLike, FfMove, FfState, FfTarget } from "./engine/contract.js";
import type { FfCursor, FfEngine } from "./engine.js";
import type { FfAction } from "./keys.js";
import { clampLineText, type FfInbound, type FfLineKind } from "./protocol.js";
import { movesForEvent, type FfRecorder } from "./record.js";
import { statePattern } from "./state.js";

export type FfTimer = { cancel: () => void };

export type FfSessionDeps = {
  engine: FfEngine;
  loadIndex: () => Promise<FfIndexLike>;
  readState: () => Promise<FfState>;
  /** ネイティブへ1行（ff-line / ff-hide） */
  send: (msg: FfInbound) => void;
  copy: (text: string) => Promise<{ ok: boolean }>;
  /** 設定で「OpenClaw の入力欄へも」を選んだときだけ渡す */
  draftToOpenclaw?: (text: string) => Promise<{ ok: boolean }>;
  record: FfRecorder;
  now: () => number;
  newId: () => string;
  setTimer: (fn: () => void, ms: number) => FfTimer;
  target: FfTarget;
  k: 3 | 4 | 5;
  /** 2行目からの間（1行ずつ流す）。1行目は待たない */
  lineGapMs: number;
  /** 触らないまま閉じるまで */
  idleMs: number;
  /** 「これで行く」のあと、結果の1行を見せてから閉じるまで */
  afterAdoptMs: number;
};

export const FF_SESSION_DEFAULTS = { k: 5 as const, lineGapMs: 180, idleMs: 20_000, afterAdoptMs: 1_600 };

export const FF_TEXT = {
  noRecord: "記録なし",
  noState: "記録なし（今の作業の状態を読めませんでした）",
  noFurther: "この先の記録はありません",
  copied: (n: number) => `指示文をクリップボードに入れました（${n} 手）`,
  copyFailed: "クリップボードに入れられませんでした",
  drafted: "OpenClaw の入力欄に入れました（送信はご自身で）",
  draftFailed: "OpenClaw を開けませんでした（クリップボードには入っています）",
} as const;

export function moveLineText(m: FfMove): string {
  return clampLineText(`${m.step}  ${m.label}  N=${m.support_n}`);
}

export class FfController {
  private visible = false;
  private session = "";
  private state: FfState | null = null;
  private index: FfIndexLike | null = null;
  private pattern = "";
  private cursor: FfCursor = { depth: 0, branch: 0 };
  /** 今の枝で、ここまでに出た手（順番どおり） */
  private path: FfMove[] = [];
  private streamToken = 0;
  private press = 0;
  private seq = 0;
  private idle: FfTimer | null = null;
  private closing: FfTimer | null = null;
  private chain: Promise<void> = Promise.resolve();
  /** キーを受けてから最初の ff-line を送るまで（Node の中の時間。テストと status 用） */
  readonly nodeFirstLineMs: number[] = [];
  /** ネイティブが測った「キー → 最初の行の描画」 */
  readonly drawnMs: number[] = [];

  constructor(private readonly deps: FfSessionDeps) {}

  get isVisible(): boolean {
    return this.visible;
  }

  /** ネイティブの ff-key。キーは受けた順に1つずつ処理する。 */
  onKey(action: FfAction, press: number): Promise<void> {
    const receivedAt = this.deps.now();
    this.chain = this.chain.then(() => this.handle(action, press, receivedAt)).catch(() => undefined);
    return this.chain;
  }

  /** ネイティブの ff-drawn（その押下の最初の行を描いた） */
  onDrawn(_press: number, seq: number, ms: number): void {
    if (seq === 0) this.drawnMs.push(ms);
  }

  private async handle(action: FfAction, press: number, receivedAt: number): Promise<void> {
    if (action === "trigger") {
      if (!this.visible) await this.open(press, receivedAt);
      else await this.again(press, receivedAt);
      return;
    }
    if (!this.visible) return; // 表示していないときは何もしない（FF-06）
    if (action === "adopt") await this.adopt(press);
    else this.close("dismiss");
  }

  private async open(press: number, receivedAt: number): Promise<void> {
    this.visible = true;
    this.closing?.cancel();
    this.closing = null;
    this.session = this.deps.newId();
    this.cursor = { depth: 0, branch: 0 };
    this.path = [];
    const [state, index] = await Promise.all([this.deps.readState(), this.deps.loadIndex()]);
    this.state = state;
    this.index = index;
    this.pattern = statePattern(state);
    await this.stream(press, receivedAt, true);
  }

  private async again(press: number, receivedAt: number): Promise<void> {
    if (!this.state || !this.index) return;
    this.cancelStream();
    const next = this.deps.engine.nextPress(this.state, this.index, this.cursor, this.deps.k);
    if (!next) {
      this.beginPress(press);
      this.line("none", FF_TEXT.noFurther, receivedAt);
      this.armIdle();
      return;
    }
    const branched = next.branch !== this.cursor.branch;
    await this.emit(branched ? "branch" : "next", this.path, this.path.length);
    this.cursor = next;
    if (branched) this.path = [];
    await this.stream(press, receivedAt, branched);
  }

  /**
   * foresee の手を流す。1行目を送ったところで戻る（キーの処理を止めない）。残りは間を置いて流す。
   * 途中で次のキーが来たら streamToken で打ち切る。
   */
  private stream(press: number, receivedAt: number, reset: boolean): Promise<void> {
    const my = ++this.streamToken;
    this.beginPress(press);
    const state = this.state!;
    const index = this.index!;
    let firstSent: () => void = () => undefined;
    const first = new Promise<void>((r) => (firstSent = r));
    const shown: FfMove[] = [];
    const run = async () => {
      let lines = 0;
      try {
        for await (const f of this.deps.engine.foresee(state, index, { k: this.deps.k, ...this.cursor })) {
          if (my !== this.streamToken) break;
          if (f.type === "done") break;
          if (f.type === "none") {
            this.line("none", f.reason === "no_state" ? FF_TEXT.noState : this.path.length ? FF_TEXT.noFurther : FF_TEXT.noRecord, receivedAt, reset && lines === 0);
            lines++;
            break;
          }
          if (lines > 0) {
            await new Promise<void>((r) => this.deps.setTimer(r, this.deps.lineGapMs));
            if (my !== this.streamToken) break;
          }
          this.line("move", moveLineText(f.move), receivedAt, reset && lines === 0, f.move.support_n);
          this.path.push(f.move);
          shown.push(f.move);
          lines++;
          if (lines === 1) firstSent();
        }
      } finally {
        firstSent();
        if (shown.length > 0) await this.emit("shown", shown);
        if (my === this.streamToken) this.armIdle();
      }
    };
    void run();
    return first;
  }

  private async adopt(press: number): Promise<void> {
    if (this.path.length === 0) return; // 採用できる手が無い（「記録なし」だけのとき）
    this.cancelStream();
    const path = [...this.path];
    const text = this.deps.engine.toInstruction(path, this.deps.target);
    const copied = await this.deps.copy(text);
    await this.emit("adopt", path, path.length);
    this.beginPress(press);
    this.line("info", copied.ok ? FF_TEXT.copied(path.length) : FF_TEXT.copyFailed, this.deps.now());
    if (this.deps.draftToOpenclaw) {
      const d = await this.deps.draftToOpenclaw(text);
      this.line("info", d.ok ? FF_TEXT.drafted : FF_TEXT.draftFailed, this.deps.now());
    }
    this.idle?.cancel();
    this.closing = this.deps.setTimer(() => this.hide(), this.deps.afterAdoptMs);
  }

  private close(kind: "dismiss" | "idle"): void {
    if (!this.visible) return;
    this.cancelStream();
    const path = [...this.path];
    // どこで止めたか（何手目まで見たか）と、閉じた（見ただけ・負例ではない）
    void this.emit("stop", path, path.length).then(() => this.emit("dismiss", path));
    void kind;
    this.hide();
  }

  private hide(): void {
    this.cancelStream();
    this.idle?.cancel();
    this.idle = null;
    this.closing?.cancel();
    this.closing = null;
    if (!this.visible) return;
    this.visible = false;
    this.path = [];
    this.state = null;
    this.index = null;
    this.deps.send({ v: 1, type: "ff-hide" });
  }

  private cancelStream(): void {
    this.streamToken++;
  }

  private armIdle(): void {
    this.idle?.cancel();
    this.idle = this.deps.setTimer(() => {
      this.chain = this.chain.then(() => this.close("idle"));
    }, this.deps.idleMs);
  }

  private beginPress(press: number): void {
    this.press = press;
    this.seq = 0;
  }

  private line(kind: FfLineKind, text: string, receivedAt: number, reset = false, n?: number): void {
    if (this.seq === 0) this.nodeFirstLineMs.push(this.deps.now() - receivedAt);
    this.deps.send({
      v: 1,
      type: "ff-line",
      press: this.press,
      seq: this.seq++,
      kind,
      text: clampLineText(text),
      ...(typeof n === "number" ? { n } : {}),
      ...(reset ? { reset: true } : {}),
    });
  }

  private async emit(kind: FfEventKind, moves: readonly FfMove[], upto?: number): Promise<void> {
    const e: FfEvent = {
      kind,
      at: this.deps.now(),
      session: this.session,
      moves: movesForEvent(moves),
      state_pattern: this.pattern,
      ...(typeof upto === "number" ? { upto_step: upto } : {}),
    };
    try {
      await this.deps.record(e);
    } catch {
      // 記録に失敗しても画面の動きは止めない
    }
  }
}
