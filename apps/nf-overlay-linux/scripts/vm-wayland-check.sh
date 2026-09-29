#!/bin/bash
# VM の Wayland セッション（gnome-shell --headless --wayland --unsafe-mode）の中で、固定の丸を確かめて画面を撮る（DK-08）。
#   OUT=/tmp/nf-linux-vm/share/wayland vm-wayland-check.sh
# 前提: /tmp/nf-session.env（vm-session.sh wayland か vm-gdm-session.sh wayland が書く）に WAYLAND_DISPLAY・DISPLAY（Xwayland）・
# DBUS_SESSION_BUS_ADDRESS がある。確認用の画面は org.gnome.Shell.Screenshot で撮る（--unsafe-mode のときだけ呼べる）。
# GDM から入った本物のセッションでは断られるので gnome-screenshot で撮る。丸の本体はどちらも使わない。
# ポータルの確認（画面共有 = ScreenCast の「Share Screen」。共有する窓・画面を本人が選ぶ）は、本人の代わりに
# AT-SPI で Share / Cancel を押す（press-button.py --portal）。丸の本体はこれを使わない。
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

shot() {
  gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell/Screenshot -m org.gnome.Shell.Screenshot.Screenshot false false "$OUT/$1.png" > /dev/null 2>&1 \
    || gnome-screenshot -f "$OUT/$1.png" > /dev/null 2>&1
  echo "shot $1"
}
send() { echo "$1" > "$FIFO"; }
count() { grep -c "$1" "$LINES"; }
last_dot() { python3 - "$LINES" <<'PY'
import json,sys
g=[json.loads(l) for l in open(sys.argv[1]) if '"geometry"' in l]
d=g[-1]["dot"]; print(d["x"]+d["w"]//2, d["y"]+d["h"]//2)
PY
}
consent() {
  # 同意の小窓が出るのを待ち、AT-SPI でボタンを押す（本人の代わり。decline = 撮らない、accept = 撮って読む）
  local cw
  cw=$(xdotool search --sync --onlyvisible --classname "^nf-overlay-consent$" | head -1)
  sleep 0.8; [ -n "${2:-}" ] && shot "$2"
  # 小窓が前面（フォーカスあり）で出たか。断られると後ろに回り、GNOME は「準備ができました」の通知を出す
  if [ "$(xdotool getactivewindow 2>/dev/null)" = "$cw" ]; then echo "consent-focused=yes"; else echo "consent-focused=no"; fi
  if [ "$1" = decline ]; then "$HERE/press-button.py" 撮らない; else "$HERE/press-button.py" 撮って読む; fi
}
# 画面共有の確認（xdg-desktop-portal-gnome の「Share Screen」）で、本人の代わりに Share / Cancel を押す
portal_ui() { if [ "$1" = accept ]; then "$HERE/press-button.py" --portal share-default; else "$HERE/press-button.py" --portal cancel; fi; }
wait_read() { local n=$1; for _ in $(seq 1 90); do [ "$(count '"type": "read"')" -ge "$n" ] && return 0; sleep 1; done; return 1; }

cat > "$OUT/cfg.json" <<'JSON'
{"v":1,"type":"config","apps":[
 {"id":"fake-ai","label":"Fake AI（確認用）","mac":[],"win":[],"linux":["nf-fake-ai"],"enabled":true,"read":"ax-then-ocr"}],
 "panelMode":"disconnected","ocrConsent":"ask-each-time","size":44,"margin":16}
JSON

# headless の GNOME は起動直後にアクティビティ画面（Overview）になるので閉じる（--unsafe-mode の Eval。確認用だけ）
gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.gnome.Shell.Eval 'Main.overview.hide()' > /dev/null 2>&1
sleep 1
# ポータルの GNOME 側を先に起こしておく（起動直後は ScreenCast がまだ出ていないことがある）
gdbus introspect --session -d org.freedesktop.impl.portal.desktop.gnome -o /org/freedesktop/portal/desktop > /dev/null 2>&1
sleep 3
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

echo "--- 2 押す → 同意 → 画面共有の確認で Share"
set -- $(last_dot); xdotool mousemove "$1" "$2" click 1
consent accept
sleep 3; shot w03-portal-dialog
portal_ui accept > "$OUT/portal-accept.log" 2>&1
wait_read 2; sleep 1; shot w04-ocr-done
echo "read=$(count '"type": "read"')"

echo "--- 3 押す → 同意 → 画面共有の確認で Cancel"
set -- $(last_dot); xdotool mousemove "$1" "$2" click 1
consent accept
sleep 3
portal_ui cancel > "$OUT/portal-cancel.log" 2>&1
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
