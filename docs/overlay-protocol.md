# NF 右下の丸 — ネイティブ ⇄ Node の約束（DK-01〜07 共通）

AI アプリ（Claude・ChatGPT のデスクトップ版、Cursor など）の中にボタンは埋め込めないので、
アプリの上に小さな丸の窓を重ねる。Node の CLI（`src/overlay/`）が設定と起動・停止を持ち、
ネイティブのプロセス（Mac: `apps/nf-overlay-macos` の `nf-overlay`、Windows: dk-win の担当）が
丸の表示・位置の追従・押したときの読み取りを持つ。Mac と Windows は**同じ形**の JSON をやりとりする。

## 通り道

- 標準入出力。**1行に JSON 1つ**（UTF-8、末尾 `\n`）。
- Node → ネイティブ: 標準入力。ネイティブ → Node: 標準出力。標準エラーは人が読む診断だけ（文字数以外の本文を出さない）。
- 知らない `type` は読み飛ばす（前方互換）。どちらも `v`（約束の版。今は `1`）を付ける。

## Node → ネイティブ

### `config`（起動直後に1回。変わったら送り直す）

```json
{"v":1,"type":"config",
 "apps":[{"id":"claude","label":"Anthropic Claude","mac":["com.anthropic.claudefordesktop"],"win":[],"enabled":true,"read":"ax-then-ocr"}],
 "panelUrl":"http://127.0.0.1:8787/panel" ,
 "panelMode":"url",
 "ocrConsent":"ask-each-time",
 "size":44,"margin":16}
```

- `apps[].mac` は bundle id、`apps[].win` は実行ファイル名（小文字比較）。**確かめた値だけ**（出どころは `src/overlay/apps.ts`）。
- `enabled:false` のアプリでは丸を出さない（DK-05）。
- `read`: `"ax-then-ocr"`（既定。AX で読めなければ OCR）/ `"ax-only"` / `"off"`（押しても読まず、パネルだけ開く）。
- `panelMode`: `"url"`（`panelUrl` を小窓の WebView で開く）/ `"disconnected"`（「未接続」の表示だけ。本番のデータがあるように見せない）。
- `ocrConsent`: 画面を撮るのは**使うたびに本人の同意を取る**（指示書 §8-3）。今は `"ask-each-time"` だけ。

### `stop`

```json
{"v":1,"type":"stop"}
```

ネイティブは丸とパネルを閉じて終了する（終了コード 0）。

### `panel-text`（任意。Node が PII 除去をした本文をパネルへ渡すとき）

読み取った生の文字はネイティブから Node に一度だけ渡り（下の `read`）、Node が `scrubPii`（`src/kensan/pii.ts`）を
通した結果をパネルに渡す。ログ・記録には**文字数だけ**を残す。

## ネイティブ → Node

| type | いつ | 例 |
|---|---|---|
| `ready` | 起動して config を受け取った | `{"v":1,"type":"ready","platform":"macos","ax":true,"screen":false}`（許可の有無。許可のダイアログは出さない） |
| `geometry` | 対象のウィンドウが前面に来た・動いた・大きさが変わった | `{"v":1,"type":"geometry","app":"claude","window":{"x":100,"y":80,"w":1200,"h":800},"dot":{"x":1240,"y":64,"w":44,"h":44}}` |
| `hidden` | 対象外のアプリが前面になった・オフになった | `{"v":1,"type":"hidden","reason":"not-target"\|"disabled"\|"no-window"}` |
| `clicked` | 丸が押された | `{"v":1,"type":"clicked","app":"claude"}` |
| `read` | 押したあとの読み取りの結果 | `{"v":1,"type":"read","app":"claude","method":"ax","ok":true,"chars":1532,"text":"…"}` |
| `panel` | パネルを開いた・閉じた | `{"v":1,"type":"panel","open":true,"mode":"url"}` |
| `error` | 続けられない失敗 | `{"v":1,"type":"error","code":"ax-denied","message":"…"}` |

- 座標は **左上原点・ポイント**（Mac の AX と同じ。Windows は DPI を掛けたあとの論理座標で揃える）。
- `read.method`: `"ax"` / `"ocr"` / `"none"`（`read:"off"`・同意なし・両方失敗）。`ok:false` のときは `reason`
  （`"ax-denied"` / `"ax-empty"` / `"screen-denied"` / `"consent-declined"` / `"ocr-empty"`）を付ける。
- `read.text` は `ok:true` のときだけ。Node はこれを**ログに書かない**。記録（`~/.neurafusion/overlay/reads.json`）に残すのは
  `app`・`method`・`ok`・`reason`・`chars`・時刻だけ（DK-02「読めた・読めない」の記録）。

## 守ること（指示書 §8）

1. 丸が押される前に他のアプリの中身を読まない。常時の監視をしない（`geometry` のための AX の位置・大きさの通知だけ受ける。本文は読まない）。
2. 画面を撮るのは押したとき、しかも毎回本人の同意（確認の小窓）を取ってから。撮るのは対象のウィンドウ1つだけ。
3. 許可（アクセシビリティ・画面収録）のダイアログを勝手に出さない・押さない。無いときは `ready` の `ax:false` / `screen:false` で知らせる。
