// NF 検品 — 取り込み（どのアプリでも使える入口の中核）。
//
// 読む範囲の線（指示 D-02）:
//   読むのは「呼び出された瞬間に渡された選択文字」だけ。selection が渡されたら
//   クリップボードにも他のアプリにも一切触れない。常時監視はしない（このモジュールに
//   リスナーは存在せず、1回の呼び出しで1回だけ読む）。
//
// macOS の許可（指示 D-03）:
//   選択文字が渡されず、クリップボード指定も無いときだけ、⌘C の合成で選択を取りに行く。
//   これには OS のアクセシビリティ許可が要り、初回の試行時に OS が1回だけ確認を出す。
//   拒否されたら state.axDenied を記録し、以後は確認を出さず「コピーしてから押す」方式
//   （クリップボード読み取り）に切り替える。

export const KENSAN_TEXT_LIMIT = 16000; // 拡張と同じ上限

export type CaptureMode = "selection" | "clipboard";

export type CaptureResult = {
  mode: CaptureMode;
  text: string;
  truncated: boolean;
  /** パネルに出す注記（コピー方式への切り替え理由など） */
  note?: string;
};

export type KensanState = {
  /** アクセシビリティ許可が拒否済み（もう確認を出さない） */
  axDenied?: boolean;
  /** 初回の許可確認を出したことがある */
  axAsked?: boolean;
};

/** 許可されていないことを表す合図。simulateCopy 実装はこれを投げる。 */
export class AxNotAuthorizedError extends Error {
  constructor(message = "accessibility not authorized") {
    super(message);
    this.name = "AxNotAuthorizedError";
  }
}

export interface CaptureDeps {
  platform: NodeJS.Platform;
  readClipboard: () => Promise<string>;
  writeClipboard: (text: string) => Promise<void>;
  /** ⌘C を合成する（macOS・アクセシビリティ許可が必要）。 */
  simulateCopy: () => Promise<void>;
  delay: (ms: number) => Promise<void>;
  loadState: () => Promise<KensanState>;
  saveState: (s: KensanState) => Promise<void>;
}

export type CaptureInput = {
  /** サービス（Quick Action）や CLI 引数から渡された選択文字 */
  selectionText?: string;
  /** 「コピーしてから押す」方式の明示指定 */
  fromClipboard?: boolean;
};

function clamp(text: string): { text: string; truncated: boolean } {
  const t = text ?? "";
  if (t.length > KENSAN_TEXT_LIMIT) return { text: t.slice(0, KENSAN_TEXT_LIMIT), truncated: true };
  return { text: t, truncated: false };
}

/**
 * 1回の呼び出しにつき1回だけ読む。優先順:
 *   1. selectionText（選択文字が渡された＝それ以外は読まない）
 *   2. fromClipboard 指定（クリップボードだけ読む）
 *   3. macOS: ⌘C 合成（初回はOSが許可を確認）→ 不許可ならクリップボード方式へ切替
 *   4. その他OS: クリップボード方式
 */
export async function captureText(input: CaptureInput, deps: CaptureDeps): Promise<CaptureResult> {
  if (typeof input.selectionText === "string" && input.selectionText.length > 0) {
    const { text, truncated } = clamp(input.selectionText);
    return { mode: "selection", text, truncated };
  }

  if (input.fromClipboard) {
    const clip = await deps.readClipboard();
    const { text, truncated } = clamp(clip);
    return { mode: "clipboard", text, truncated, note: "コピーしてから押す方式で読み取りました。" };
  }

  if (deps.platform === "darwin") {
    const state = await deps.loadState();
    if (!state.axDenied) {
      // 元のクリップボードを退避してから ⌘C を合成し、読み取り後に元へ戻す。
      let original: string | null = null;
      try {
        original = await deps.readClipboard();
      } catch {
        original = null;
      }
      try {
        if (!state.axAsked) {
          // 初回だけ: この試行で OS のアクセシビリティ確認が1回出る。
          await deps.saveState({ ...state, axAsked: true });
        }
        await deps.simulateCopy();
        await deps.delay(180);
        const copied = await deps.readClipboard();
        if (original !== null && original !== copied) {
          // 選択の読み取りが済んだら、利用者のクリップボードを元に戻す。
          await deps.writeClipboard(original).catch(() => {});
        }
        const picked = copied && copied !== original ? copied : copied;
        const { text, truncated } = clamp(picked ?? "");
        if (text.trim().length === 0) {
          return {
            mode: "clipboard",
            text: "",
            truncated: false,
            note: "選択文字を取得できませんでした。検品したい文字を選んでからもう一度実行してください。",
          };
        }
        return { mode: "selection", text, truncated };
      } catch (err) {
        if (err instanceof AxNotAuthorizedError) {
          // 拒否された: 記録して以後は確認を出さない（1回だけ求める）。
          await deps.saveState({ ...state, axAsked: true, axDenied: true });
        } else {
          // 合成に失敗（その他の理由）でも、この回はコピー方式で続ける。
        }
      }
    }
    const clip = await deps.readClipboard().catch(() => "");
    const { text, truncated } = clamp(clip);
    return {
      mode: "clipboard",
      text,
      truncated,
      note:
        "アクセシビリティの許可が無いため「コピーしてから押す」方式です。検品したい文字をコピーしてから実行してください。",
    };
  }

  // Windows / Linux: 選択の自動取得は行わず、コピー方式のみ。
  const clip = await deps.readClipboard().catch(() => "");
  const { text, truncated } = clamp(clip);
  return {
    mode: "clipboard",
    text,
    truncated,
    note: "このOSでは「コピーしてから押す」方式です。検品したい文字をコピーしてから実行してください。",
  };
}
