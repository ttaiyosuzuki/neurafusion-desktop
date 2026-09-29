#!/bin/bash
# VM の Wayland セッション（gnome-shell --headless --wayland --unsafe-mode）の中で、固定の丸を確かめて画面を撮る（DK-08）。
#   OUT=/tmp/nf-linux-vm/share/wayland vm-wayland-check.sh
# 前提: /tmp/nf-session.env に WAYLAND_DISPLAY・DISPLAY（Xwayland）・DBUS_SESSION_BUS_ADDRESS がある。
# 確認用の画面は org.gnome.Shell.Screenshot で撮る（--unsafe-mode のときだけ呼べる。丸の本体はこれを使わない）。
# ポータルの確認（GNOME の「撮影」の画面）は、本人の代わりに AT-SPI でボタンを押す（accept-portal.py）。
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-/tmp/nf-wayland-check}
mkdir -p "$OUT"
set -a; . /tmp/nf-session.env; set +a
LINES=$OUT/lines.jsonl
FIFO=/tmp/nf-drive.fifo
: > "$LINES"
rm -f "$FIFO"; mkfifo "$FIFO"
rm -f ~/.local/share/neurafusion/overlay/read-log.json

shot() { gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell/Screenshot -m org.gnome.Shell.Screenshot.Screenshot false false "$OUT/$1.png" > /dev/null; echo "shot $1"; }
send() { echo "$1" > "$FIFO"; }
count() { grep -c "$1" "$LINES"; }
last_dot() { python3 - "$LINES" <<'PY'
import json,sys
g=[json.loads(l) for l in open(sys.argv[1]) if '"geometry"' in l]
d=g[-1]["dot"]; print(d["x"]+d["w"]//2, d["y"]+d["h"]//2)
PY
}
consent() {
  local D; D=$(xdotool search --sync --onlyvisible --classname "^nf-overlay-consent$" | head -1)
  for _ in $(seq 1 20); do [ "$(xdotool getactivewindow 2>/dev/null)" = "$D" ] && break; sleep 0.3; done
  sleep 0.5; [ -n "${2:-}" ] && shot "$2"
  if [ "$1" = decline ]; then xdotool key Escape; else xdotool key Tab; sleep 0.3; xdotool key space; fi
}
wait_read() { local n=$1; for _ in $(seq 1 90); do [ "$(count '"type": "read"')" -ge "$n" ] && return 0; sleep 1; done; return 1; }

cat > "$OUT/cfg.json" <<'JSON'
{"v":1,"type":"config","apps":[
 {"id":"fake-ai","label":"Fake AI（確認用）","mac":[],"win":[],"linux":["nf-fake-ai"],"enabled":true,"read":"ax-then-ocr"}],
 "panelMode":"disconnected","ocrConsent":"ask-each-time","size":44,"margin":16}
JSON

# 代わりの AI 窓はネイティブの Wayland の窓（GDK_BACKEND は既定 = wayland）
"$HERE/fake-ai.py" > /dev/null 2>&1 &
sleep 4
"$HERE/drive.py" --config "$OUT/cfg.json" --out "$LINES" --fifo "$FIFO" 2> "$OUT/stderr.log" &
DRV=$!
sleep 4
shot w01-fixed-dot
echo "geometry=$(count '"geometry"') read_before_click=$(count '"type": "read"')"
if [ "$(count '"geometry"')" = 0 ]; then echo "丸が出ない"; tail -5 "$OUT/stderr.log"; send '{"v":1,"type":"stop"}'; echo "lines=$(wc -l < "$LINES")"; exit 1; fi

echo "--- 1 押す → 同意を断る（撮らない）"
set -- $(last_dot); xdotool mousemove "$1" "$2" click 1
consent decline w02-consent-dialog; wait_read 1
echo "read=$(count '"type": "read"')"

echo "--- 2 押す → 同意 → ポータルの確認で撮る"
set -- $(last_dot); xdotool mousemove "$1" "$2" click 1
consent accept
sleep 3; shot w03-portal-dialog
python3 "$HERE/accept-portal.py" accept > "$OUT/portal-accept.log" 2>&1
wait_read 2; sleep 1; shot w04-ocr-done
echo "read=$(count '"type": "read"')"

echo "--- 3 押す → 同意 → ポータルで取り消す"
set -- $(last_dot); xdotool mousemove "$1" "$2" click 1
consent accept
sleep 3
python3 "$HERE/accept-portal.py" cancel > "$OUT/portal-cancel.log" 2>&1
wait_read 3; sleep 1; shot w05-portal-cancelled
echo "read=$(count '"type": "read"')"

echo "--- 4 全体のオフ"
send "$(python3 -c "import json;c=json.load(open('$OUT/cfg.json'));c['enabled']=False;print(json.dumps(c,ensure_ascii=False))")"
sleep 2; shot w06-all-off
send '{"v":1,"type":"get-read-log"}'; sleep 1
send '{"v":1,"type":"stop"}'; sleep 2
wait $DRV 2>/dev/null
pkill -f "[f]ake-ai.py"
ls ~/Pictures 2>/dev/null | head -3 > "$OUT/pictures-left.txt"
echo "lines=$(wc -l < "$LINES")"
