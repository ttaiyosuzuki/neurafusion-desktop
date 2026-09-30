# 先読み（FF）— デスクトップ

キーを押したときだけ、今の作業の状態から「同じ状態で本物が実際に打った次の手」を、半透明の行で1行ずつ出す。
手を選ぶのはエンジン（neurafusion-171268ee の `engine/ff`。同梱のバンドルは `src/ff/engine/ff-runtime.js`）。
NEURA FUSION は操作を実行しない。選んだ道筋を、本人が使っている AI への指示文にして渡すだけ。

- 通り道: 右下の丸と同じネイティブのプロセスと標準入出力（[overlay-protocol.md](overlay-protocol.md)「FF 先読み」）
- Node 側: `src/ff/`（キー・設定・状態の読み取り・エンジンの入口・キーの動き・指示文の渡し方・記録）
- ネイティブ: Mac `apps/nf-overlay-macos`（Carbon `RegisterEventHotKey`・`NSPanel`）、Windows `apps/nf-overlay-windows`（`RegisterHotKey`・`WS_EX_NOACTIVATE`）、
  Linux `apps/nf-overlay-linux`（X11 `XGrabKey`・Wayland は xdg-desktop-portal の GlobalShortcuts）

## キー（FF-01）

既定は `engine/ff/keys.json` v2（拡張・Web と同じ）。

| 動き | 既定（Mac） | 既定（Windows・Linux） | 登録 |
|---|---|---|---|
| 起動（もう一度押す＝さらに先／別の枝） | Option+Shift+, | Alt+Shift+, | いつでも |
| これで行く | Option+Shift+. | Alt+Shift+. | 行が出ている間だけ |
| 閉じる | Escape | Escape | 行が出ている間だけ |

- ⌘P・Ctrl+P（印刷）は使わない。既存の NF のキー（Alt+Shift+N・Ctrl/⌘+Shift+9）とも重ねない。Alt+Shift+. は VS Code / Cursor の Auto Fix なので、全体では取らない。
- 変える: `neurafusion overlay ff keys --trigger "Ctrl+Alt+J"`（保存先は丸と同じ `~/.neurafusion/overlay/settings.json` の `ff`）。使えないキーは保存しない。
- 他のアプリが先に取っているキーは登録に失敗する。`neurafusion overlay ff` と起動時のログに出す（お知らせは出さない）。
- **Wayland（Linux）**: portal には「表示中だけ登録」が無いので、全体に登録するのは起動キーだけ。これで行く・閉じるのキーは使えない
  （Esc と Alt+Shift+. を他のアプリから奪わないため）。行は放っておくと 20 秒で閉じる。

## 動き（FF-02〜06）

1. 押す → 端末内の正規トークンの記録（`~/.neurafusion/ff/state.jsonl` の末尾）から今の状態（直前の編集・捨てた提案・エラー・問い直し）を作り、
   エンジンの `foresee` で3〜5手を引く。1行目は届いたらすぐ、2行目からは 0.18 秒ずつ流す。各行に支持数 N。
2. もう一度押す → `nextPress`（さらに先。尽きたら別の枝。枝も尽きたら「この先の記録はありません」）
3. これで行く → ここまでに出た手の道筋を `toInstruction` で指示文にし、**クリップボード**へ。
   `neurafusion overlay ff openclaw-draft-on` にしておくと、**OpenClaw の会話の入力欄にも**入れる
   （公式の `http://127.0.0.1:<port>/chat/main?draft=<指示文>` を既定のブラウザで開くだけ。送信は本人が押す。トークンは使わない）。
4. 閉じる・20 秒触らない → 閉じる。

- **実在の記録が無い手は出さない。** 索引は `~/.neurafusion/ff/index.json` のうち `mode:"production"` で、出どころがすべて `provenance:"real"` の物だけを読む。
  FF はまだ取り込み台帳（`sources.yaml`）の読み手ではない（足すには本人の承認が要る）ので、今の本番の索引は空で、押すと「記録なし」の1行だけが出る。
- 状態の記録（`state.jsonl`）を書く側（アプリの操作から端末内で declang のトークンを作る所）はまだデスクトップに無い。無ければ「記録なし（今の作業の状態を読めませんでした）」。
- エンジンのバンドルが入っていないときは手を1つも作らない（推測で手を作る実装は置かない）。

## 普段は何も出さない（FF-06）

- 押すまで行の窓は作らない。お知らせ（通知・バッジ・音）は出さない。登録の失敗もログと `overlay ff` だけ。
- 右下の丸と、丸を押したときのパネルは今までどおり（本人が押したときだけ開く）。先読みは丸を開かない。

## 画面共有（FF-07）

画面共有から行の窓を隠す機能は作らない（Mac の `sharingType`、Windows の表示の除外、Electron の `setContentProtection` を使わない）。
`src/ff/ff.test.ts` が 3 つのアプリと `src/ff`・`src/overlay` のコードを静的に見張る。

## 記録（FF-05）

`~/.neurafusion/ff/events.jsonl` に FfEvent（shown・next・branch・adopt〔何手目まで〕・stop〔何手目で止めたか〕・dismiss）。
中身は正規トークン・位置・支持数・状態の patternId（ハッシュ）・時刻だけ。教師への変換は `engine/ff/events.ts`（adopt ＞ stop の手前まで見た ＞ 表示だけ。dismiss は負例ではない）。

## 測る（FF-08）

- Node: `node scripts/run-vitest.mjs run src/ff/ff.test.ts`（押すまで何も出ない・記録の無い手が出ない・指示文・Mac の本物のクリップボード・静的検査・Node の中の時間 20 回）
- Mac 実機（キーを受けた時刻 → 最初の行を描き終えた時刻。ネイティブの `ff-drawn.ms`）:
  `NF_FF_MEASURE=1 NF_OVERLAY_BIN=apps/nf-overlay-macos/.build/debug/nf-overlay node scripts/run-vitest.mjs run src/ff/ff.measure.test.ts`
  （キーを System Events で送る。登録が通ったときだけ送る。索引はテスト用）
- Windows・Linux の実機の時間は、まだ測っていない。
