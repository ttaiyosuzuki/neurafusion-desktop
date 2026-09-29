#!/bin/bash
# VM の X11 セッションの中で、丸の動きを1通り確かめて画面を撮る（DK-08・TS-38 の実機分）。
#   OUT=/tmp/nf-linux-vm/share/x11 vm-x11-check.sh
# 前提: /tmp/nf-session.env（vm-session.sh・x11shell.sh が書く）に DISPLAY と DBUS_SESSION_BUS_ADDRESS がある。
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-/tmp/nf-x11-check}
mkdir -p "$OUT"
set -a; . /tmp/nf-session.env; set +a
LINES=$OUT/lines.jsonl
FIFO=/tmp/nf-drive.fifo
: > "$LINES"
rm -f "$FIFO"; mkfifo "$FIFO"
rm -f ~/.local/share/neurafusion/overlay/read-log.json

shot() { import -window root "$OUT/$1.png"; echo "shot $1"; }
send() { echo "$1" > "$FIFO"; }
last_dot() { python3 - "$LINES" <<'PY'
import json,sys
g=[json.loads(l) for l in open(sys.argv[1]) if '"geometry"' in l]
d=g[-1]["dot"]; print(d["x"]+d["w"]//2, d["y"]+d["h"]//2)
PY
}
count() { grep -c "$1" "$LINES"; }
# 同意の小窓のボタンを押す（左 = 撮らない、右 = 撮って読む）。ボタンの列は小窓の下端から 18px
press_consent() {
  # 小窓が前面（フォーカスあり）になるのを待ち、キーボードで押す。decline = Esc（撮らない）、accept = Tab で「撮って読む」へ移って Space
  local D; D=$(xdotool search --sync --onlyvisible --classname "^nf-overlay-consent$" | head -1)
  for _ in $(seq 1 20); do [ "$(xdotool getactivewindow)" = "$D" ] && break; sleep 0.3; done
  sleep 0.5; [ -n "${2:-}" ] && shot "$2"
  if [ "$1" = decline ]; then xdotool key Escape; else xdotool key Tab; sleep 0.3; xdotool key space; fi
}
wid() { xdotool search --sync --onlyvisible --classname "$1" | head -1; }

cat > "$OUT/cfg.json" <<'JSON'
{"v":1,"type":"config","apps":[
 {"id":"fake-ai","label":"Fake AI（確認用）","mac":[],"win":[],"linux":["nf-fake-ai"],"enabled":true,"read":"ax-then-ocr"},
 {"id":"fake-ai-noa11y","label":"Fake AI 読めない版（確認用）","mac":[],"win":[],"linux":["nf-fake-ai-noa11y"],"enabled":true,"read":"ax-then-ocr"}],
 "panelMode":"disconnected","ocrConsent":"ask-each-time","size":44,"margin":16}
JSON

"$HERE/fake-ai.py" > /dev/null 2>&1 &
"$HERE/fake-ai.py" --no-a11y > /dev/null 2>&1 &
gnome-text-editor > /dev/null 2>&1 &
sleep 4
A=$(wid "^nf-fake-ai$"); B=$(wid "^nf-fake-ai-noa11y$"); T=$(xdotool search --onlyvisible --class gnome-text-editor | head -1)
echo "windows A=$A B=$B T=$T"
xdotool windowmove "$B" 900 400; xdotool windowmove "$A" 120 120

"$HERE/drive.py" --config "$OUT/cfg.json" --out "$LINES" --fifo "$FIFO" 2> "$OUT/stderr.log" &
DRV=$!
sleep 3

echo "--- 1 追従"
xdotool windowactivate --sync "$A"; sleep 1.5; shot 01-follow-start
xdotool windowmove --sync "$A" 400 200; sleep 1.5; shot 02-follow-moved
xdotool windowsize --sync "$A" 640 480; sleep 1.5; shot 03-follow-resized
echo "geometry=$(count '"geometry"')"
if [ "$(count '"geometry"')" = 0 ]; then echo "丸が出ない"; tail -5 "$OUT/stderr.log"; send '{"v":1,"type":"stop"}'; echo "lines=$(wc -l < "$LINES")"; exit 1; fi
read_before=$(count '"type":"read"')

echo "--- 2 対象外・最小化"
xdotool windowactivate --sync "$T"; sleep 1.5; shot 04-not-target
xdotool windowactivate --sync "$A"; sleep 1; xdotool windowminimize --sync "$A"; sleep 1.5
xdotool windowactivate --sync "$A"; sleep 1.5
echo "hidden=$(count '"hidden"') read_before_click=$read_before"

echo "--- 3 押す → AT-SPI"
set -- $(last_dot); xdotool mousemove "$1" "$2" click 1; sleep 4; shot 05-clicked-atspi-panel
echo "read=$(count '"type":"read"') clicked=$(count '"clicked"')"

echo "--- 4 読めない版: 同意を断る"
xdotool windowactivate --sync "$B"; sleep 1.5
set -- $(last_dot); xdotool mousemove "$1" "$2" click 1
press_consent decline 06-consent-dialog; sleep 3
echo "read=$(count '"type":"read"')"

echo "--- 5 読めない版: 同意して撮る"
xdotool windowactivate --sync "$B"; sleep 1.5
set -- $(last_dot); xdotool mousemove "$1" "$2" click 1
press_consent accept 07a-consent-accept
for _ in $(seq 1 60); do [ "$(count '"method": "ocr", "ok": true')" != 0 ] && break; sleep 1; done; sleep 1; shot 07-ocr-done

echo "--- 6 アプリのオフ"
send "$(python3 -c "import json;c=json.load(open('$OUT/cfg.json'));c['apps'][0]['enabled']=False;print(json.dumps(c,ensure_ascii=False))")"
xdotool windowactivate --sync "$A"; sleep 1.5; shot 08-app-off
send '{"v":1,"type":"get-read-log"}'; sleep 1
send '{"v":1,"type":"stop"}'; sleep 2
wait $DRV 2>/dev/null
cp ~/.local/share/neurafusion/overlay/read-log.json "$OUT/read-log.json" 2>/dev/null
pkill -f fake-ai.py; pkill -x gnome-text-editor
echo "lines=$(wc -l < "$LINES")"
