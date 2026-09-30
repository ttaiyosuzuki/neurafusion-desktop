# NF 右下の丸 — ネイティブ ⇄ Node の約束（DK-01〜07 共通）

AI アプリ（Claude・ChatGPT のデスクトップ版、Cursor など）の中にボタンは埋め込めないので、
アプリの上に小さな丸の窓を重ねる。Node の CLI（`src/overlay/`）が設定と起動・停止を持ち、
ネイティブのプロセス（Mac: `apps/nf-overlay-macos` の `nf-overlay`、Windows: `apps/nf-overlay-windows`、Linux: `apps/nf-overlay-linux`（[overlay-linux.md](overlay-linux.md)））が
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

## FF 先読み（FF-01〜08。丸と同じ通り道・同じ `v:1`。知らない type は読み飛ばす）

キーを押すまで何も出さない。押したら、今の作業の状態から「本物が実際に打った次の手」を半透明の行で1行ずつ出す。
手を選ぶのは Node（`src/ff/`・エンジンは `engine/ff` のバンドル）。ネイティブは**全体キーの受け取りと行の描画だけ**。

### Node → ネイティブ

| type | いつ | 例 |
|---|---|---|
| `ff-config` | config の直後に1回。キーを変えたら送り直す | `{"v":1,"type":"ff-config","enabled":true,"keys":{"trigger":{"mods":["alt","shift"],"key":","},"adopt":{"mods":["alt","shift"],"key":"."},"close":{"mods":[],"key":"escape"}},"scopes":{"trigger":"global","adopt":"overlay-only","close":"overlay-only"},"labels":{"trigger":"Option+Shift+,","adopt":"Option+Shift+.","close":"Escape"},"opacity":0.72}` |
| `ff-line` | 1行出す | `{"v":1,"type":"ff-line","press":3,"seq":0,"kind":"move","text":"1  型エラーを直す  N=12","n":12}` |
| `ff-hide` | 閉じる | `{"v":1,"type":"ff-hide"}` |

- `keys.*.mods` は `ctrl` / `alt` / `shift` / `meta`（Mac の ⌘・Windows の Win・Linux の Super）。`key` は小文字1文字（US 配列の位置: `.` `,` `a`〜`z` `0`〜`9` など）か名前（`escape`・`space`・`f1`〜`f24`）。
- `scopes` が `global` のキー（既定は `trigger` だけ）を**全体キー**として登録する（Mac: Carbon `RegisterEventHotKey`・Windows: `RegisterHotKey`・Linux X11: `XGrabKey`）。
  `overlay-only` のキー（既定は `adopt` と `close`）は**行が出ている間だけ**登録し、隠したら外す（Esc や、VS Code / Cursor の Auto Fix の Alt+Shift+. を他のアプリから奪わない）。
  `scopes` が無い古い Node からの ff-config は、この既定の割り当てで読む。
- `enabled:false` なら全体キーを外す。
- `ff-line`: 窓が出ていなければ出す。`reset:true` なら前の行を消してから足す。`kind` は `move`（手）・`none`（「記録なし」など）・`info`（「クリップボードに入れました」など）。
- 行の窓: **常に前面・フォーカスを奪わない**（Mac: `NSPanel` の `.nonactivatingPanel`＋`orderFrontRegardless`、Windows: `WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_TOOLWINDOW`＋`ShowWithoutActivation`、Linux: `Gtk.Window` の `POPUP`＋`set_accept_focus(False)`＋`set_keep_above(True)`）。
  マウスを素通しにする。半透明（`opacity`）。置き場は主画面の下寄り中央。
- **画面共有から隠す API は使わない**（FF-07: Mac の `sharingType = .none`、Windows の `SetWindowDisplayAffinity`、Electron の `setContentProtection`）。`src/ff/ff.test.ts` が静的に見張る。

### ネイティブ → Node

| type | いつ | 例 |
|---|---|---|
| `ff-key` | 全体キー（表示中は close も）を受けた | `{"v":1,"type":"ff-key","action":"trigger","press":3}` |
| `ff-drawn` | その押下（press）の**最初の行**を描いた | `{"v":1,"type":"ff-drawn","press":3,"seq":0,"ms":41.7}` |
| `ff-keys` | 全体キーの登録の結果（ff-config のたび） | `{"v":1,"type":"ff-keys","ok":false,"failed":["adopt"]}` |

- `press` はネイティブが振る押下の番号（起動から1ずつ増える）。Node は答えの `ff-line` に同じ番号を付ける。
- `ff-drawn.ms` は**キーを受けた時刻 → その行が画面に描かれた時刻**（単調時計・ミリ秒）。FF-08 の「0.8秒以内」はこの値で測る。
  Mac は `CFAbsoluteTimeGetCurrent` ではなく `ProcessInfo.systemUptime`、Windows は `Stopwatch`、Linux は `time.monotonic()`。
- 登録に失敗したキー（他のアプリが先に取っている）は `failed` に入れる。Node は設定の画面・`neurafusion overlay ff` に出す（お知らせは出さない）。
