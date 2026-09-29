#!/bin/bash
# VM（画面なし）の中で GNOME のセッションを立てる。確認用（DK-08）。
#   vm-session.sh x11      … Xorg（dummy ドライバ・1920x1080）の上で gnome-session（Ubuntu の「Ubuntu on Xorg」と同じ中身）
#   vm-session.sh wayland  … gnome-shell --headless --wayland --virtual-monitor 1920x1080（Xwayland は必要なときに起動）
# どちらも dbus-run-session の中で動かし、その中で CMD（第2引数以降）を実行する。環境は /tmp/nf-session.env に書く。
set -u
MODE=${1:?x11|wayland}
shift
export XDG_CURRENT_DESKTOP=ubuntu:GNOME
export XDG_SESSION_DESKTOP=ubuntu
export GNOME_SHELL_SESSION_MODE=ubuntu
export NO_AT_BRIDGE=0

if [ "$MODE" = x11 ]; then
  export XDG_SESSION_TYPE=x11
  if ! [ -e /tmp/.X11-unix/X1 ]; then
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
    sudo nohup Xorg :1 -config /etc/X11/nf-dummy.conf -noreset -nolisten tcp >/tmp/nf-xorg.log 2>&1 &
    for _ in $(seq 1 50); do [ -e /tmp/.X11-unix/X1 ] && break; sleep 0.2; done
    sudo chmod 666 /tmp/.X11-unix/X1 2>/dev/null
    xhost +local: >/dev/null 2>&1 || DISPLAY=:1 xhost +local: >/dev/null 2>&1
  fi
  export DISPLAY=:1
  DISPLAY=:1 xhost +local: >/dev/null 2>&1
  exec dbus-run-session -- bash -c '
    gnome-session --builtin --session=ubuntu >/tmp/nf-gnome-session.log 2>&1 &
    for _ in $(seq 1 60); do gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1 && break; sleep 1; done
    env | grep -E "^(DISPLAY|DBUS_SESSION_BUS_ADDRESS|XDG_)" > /tmp/nf-session.env
    "$@"
  ' _ "$@"
else
  export XDG_SESSION_TYPE=wayland
  unset DISPLAY
  exec dbus-run-session -- bash -c '
    gnome-shell --headless --wayland --virtual-monitor 1920x1080 --unsafe-mode >/tmp/nf-gnome-shell.log 2>&1 &
    for _ in $(seq 1 60); do gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1 && break; sleep 1; done
    export WAYLAND_DISPLAY=wayland-0
    # Xwayland の番号は mutter が決める（空いている最初の番号）
    for n in 0 1 2 3; do if [ -e /tmp/.X11-unix/X$n ] && ! [ -e /tmp/.X$n-lock ] || grep -qs Xwayland /proc/$(cat /tmp/.X$n-lock 2>/dev/null | tr -d " ")/cmdline 2>/dev/null; then export DISPLAY=:$n; fi; done
    env | grep -E "^(DISPLAY|WAYLAND_DISPLAY|DBUS_SESSION_BUS_ADDRESS|XDG_)" > /tmp/nf-session.env
    "$@"
  ' _ "$@"
fi
