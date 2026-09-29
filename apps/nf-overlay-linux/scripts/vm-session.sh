#!/bin/bash
# VM（画面なし）の中で、丸の確認用の GNOME を立てる（DK-08。丸の本体はこれを使わない）。
#   vm-session.sh x11      … Xorg :1（dummy ドライバ・1920x1080）＋ gnome-shell --x11（session mode ubuntu）
#   vm-session.sh wayland  … PipeWire ＋ gnome-shell --headless --wayland --virtual-monitor 1920x1080（＋ Xwayland）
#   vm-session.sh down     … 止める
# gnome-shell を dbus-run-session の中に常駐させ、環境を /tmp/nf-session.env に書く（vm-*-check.sh はこれを読む）。
# gnome-session は logind のセッションが無いと上がらず、46 には --builtin も無いので gnome-shell を直接動かす。
# ログイン画面（GDM）から入る本物のセッションで確かめるときは vm-gdm-session.sh。
set -u
MODE=${1:?x11|wayland|down}

down() {
  pkill -f "[n]f-session-keep"
  pkill -x gnome-shell; pkill -x pipewire; pkill -x wireplumber; pkill -f "[x]dg-desktop-portal"; pkill -f "[g]sd-"
  sleep 2
  pkill -f "[d]bus-run-session"
  sudo pkill -x Xorg
  sleep 1
  rm -f /tmp/nf-session.env
}

wait_env() {
  for _ in $(seq 1 90); do [ -s /tmp/nf-session.env ] && break; sleep 1; done
  [ -s /tmp/nf-session.env ] || { echo "セッションが上がらない"; return 1; }
  set -a; . /tmp/nf-session.env; set +a
  gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.freedesktop.DBus.Properties.Get org.gnome.Shell ShellVersion
}

down
[ "$MODE" = down ] && exit 0
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS XAUTHORITY

if [ "$MODE" = x11 ]; then
  if ! [ -e /etc/X11/nf-dummy.conf ]; then
    sudo tee /etc/X11/nf-dummy.conf >/dev/null <<'EOF'
Section "Device"
  Identifier "dummy"
  Driver "dummy"
  VideoRam 256000
EndSection
Section "Monitor"
  Identifier "m"
  HorizSync 5.0-1000.0
  VertRefresh 5.0-200.0
  Modeline "1920x1080" 148.50 1920 2008 2052 2200 1080 1084 1089 1125 +hsync +vsync
EndSection
Section "Screen"
  Identifier "s"
  Device "dummy"
  Monitor "m"
  DefaultDepth 24
  SubSection "Display"
    Depth 24
    Modes "1920x1080"
  EndSubSection
EndSection
EOF
  fi
  sudo rm -f /tmp/.X11-unix/X1 /tmp/.X1-lock
  # ログは利用者の側で開く（/tmp の他人のファイルには root も書けない: fs.protected_regular）
  sudo nohup Xorg :1 -config /etc/X11/nf-dummy.conf -noreset -nolisten tcp > /tmp/nf-xorg.log 2>&1 < /dev/null &
  for _ in $(seq 1 50); do [ -e /tmp/.X11-unix/X1 ] && break; sleep 0.2; done
  DISPLAY=:1 xhost +local: > /dev/null
  export XDG_CURRENT_DESKTOP=ubuntu:GNOME XDG_SESSION_DESKTOP=ubuntu GNOME_SHELL_SESSION_MODE=ubuntu XDG_SESSION_TYPE=x11 DISPLAY=:1
  setsid nohup dbus-run-session -- bash -c '
    gnome-shell --x11 --replace > /tmp/nf-gnome-shell-x11.log 2>&1 &
    for _ in $(seq 1 60); do gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.freedesktop.DBus.Properties.Get org.gnome.Shell ShellVersion > /dev/null 2>&1 && break; sleep 1; done
    env | grep -E "^(DISPLAY|DBUS_SESSION_BUS_ADDRESS|XDG_)" > /tmp/nf-session.env
    exec -a nf-session-keep sleep infinity
  ' > /tmp/nf-session.out 2>&1 < /dev/null &
  wait_env
else
  export XDG_CURRENT_DESKTOP=GNOME XDG_SESSION_TYPE=wayland
  unset GNOME_SHELL_SESSION_MODE XDG_SESSION_DESKTOP
  before=$(ls /tmp/.X11-unix 2>/dev/null | sort | tr '\n' ' ')
  setsid nohup dbus-run-session -- bash -c '
    # この VM（GPU なし）では xdg-desktop-portal-gnome の GTK4 が GL の描画で落ちることがあった → cairo で描かせる
    dbus-update-activation-environment GSK_RENDERER=cairo
    # 画面共有（ScreenCast）の相手の PipeWire を gnome-shell より先に起こす
    pipewire > /tmp/pw.log 2>&1 &
    sleep 1
    wireplumber > /tmp/wp.log 2>&1 &
    sleep 2
    gnome-shell --headless --wayland --virtual-monitor 1920x1080 --unsafe-mode > /tmp/nf-gnome-shell-wl.log 2>&1 &
    for _ in $(seq 1 60); do gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.freedesktop.DBus.Properties.Get org.gnome.Shell ShellVersion > /dev/null 2>&1 && break; sleep 1; done
    sleep 2
    export WAYLAND_DISPLAY=wayland-0
    # Xwayland の番号は mutter が決める（起動前に無かった番号）
    n=$(comm -13 <(echo "$1" | tr " " "\n" | sort) <(ls /tmp/.X11-unix | sort) | head -1)
    export DISPLAY=:${n#X}
    export XAUTHORITY=$(tr "\0" "\n" < /proc/$(pgrep -f "Xwayland $DISPLAY " | head -1)/cmdline | grep -A1 -- -auth | tail -1)
    dbus-update-activation-environment WAYLAND_DISPLAY DISPLAY XAUTHORITY XDG_CURRENT_DESKTOP XDG_SESSION_TYPE
    env | grep -E "^(DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|DBUS_SESSION_BUS_ADDRESS|XDG_)" > /tmp/nf-session.env
    exec -a nf-session-keep sleep infinity
  ' _ "$before" > /tmp/nf-session.out 2>&1 < /dev/null &
  wait_env
fi
