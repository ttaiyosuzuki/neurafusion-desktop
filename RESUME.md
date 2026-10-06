# RESUME.md — v7 W7（デスクトップ側）／停止（Fableのみの期間）

**停止（Fableのみの期間）。** 本人の指示 2026-10-06 18:4x JST「今は Fable だけで進めるので、このセッションの作業は止める」。
**作った物は 1 つも消していない。** 再開の指示が来るまで、このレーンは新しいタスクを取らない。

| | |
|---|---|
| レーン | v7 W7 — 拡張・デスクトップ（OP-09b・OP-09c・TS-71）のデスクトップ側 |
| リポジトリ | `ttaiyosuzuki/neurafusion-desktop` |
| 枝 | `opus/w7` |
| 作業木 | `~/nf-wt/w7-desktop` |
| HEAD（2026-10-06 18:45 JST 実測） | `a760a3d45`・**[WIP] 9 本**（origin に push した） |
| `/tmp/nf-v7-lanes/w7.done` | **無** — 途中で止まった（5 時間の枠・13:3x） |

NF 側（`neurafusion-171268ee`）の同じレーンは枝 `opus/w7`・作業木 `~/nf-wt/w7`。

## 置いた物（OP-09c・端末の中だけで動く道筋）

9 本の [WIP] コミットの中身（古い順）:

1. `9aeee329a` 道筋の形（NF `engine/trace/types.ts` の使う所の写し）
2. `2e0e68c0d` 端末の台帳（node:sqlite・版・前の版に戻す・FTS5 trigram の索引）
3. `6c8f195a1` オフラインの道筋（台帳だけの段＋鍵がある時だけモデルの段）
4. `96a75df0f` OS のキーチェーン（macOS `security -i`・Linux `secret-tool`・Windows `CredWrite`）。**鍵は標準入力だけ**
5. `0cd40523c` 入口（オフラインの判定と表示・キーチェーンの鍵で呼ぶ ModelPort・伏せ字）
6. `849efc214` テスト 13（台帳の版・索引・鍵なし／オフライン／つながる・キーチェーン 3 OS は偽物の Runner）
7. `bd53d72b9`・`e44ae7798`（`KeychainTraceStore.swift`）・`a760a3d45`

## 再開するとき

1. まとめ役の RESUME: `~/nf-wt/v7/RESUME.md`（止めたものと戻し方）。NF 側の引き継ぎは NF リポジトリの `_docs/OC作業指示/engine/v7/HANDOFF.md` §3。
2. [WIP] を squash するかはまとめ役が決める。**desktop の `main` には何も入れていない。**
3. 状態は自分のシェルで測り直す（`.done` が無い＝未完）。
