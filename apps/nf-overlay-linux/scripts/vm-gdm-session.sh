#!/bin/bash
# VM の中で、ログイン画面（GDM）から自動ログインした本物の GNOME のセッションを立てる（DK-08 の確認用。丸の本体は使わない）。
#   vm-gdm-session.sh x11      … 「Ubuntu on Xorg」（セッション ubuntu-xorg。GDM の Wayland は切る）
#   vm-gdm-session.sh wayland  … 「Ubuntu」（セッション ubuntu。Wayland）
#   vm-gdm-session.sh down     … GDM を止め、GDM の設定を元に戻す
# 画面の装置が無い VM（Lima の vz・画面なし）では、仮想の画面ドライバ vkms（linux-modules-extra-$(uname -r)）を
# 読み込んで seat0 を「画面あり」（CanGraphical=yes）にする。gnome-session が systemd --user に渡した環境を
# /tmp/nf-session.env に書く（vm-*-check.sh はこれを読む）。
set -u
MODE=${1:?x11|wayland|down}
U=$(id -un)
UID_=$(id -u)
CONF=/etc/gdm3/custom.conf
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$UID_/bus

down() {
  sudo systemctl stop gdm
  [ -e $CONF.nf-orig ] && sudo cp $CONF.nf-orig $CONF
  rm -f /tmp/nf-session.env
}

if [ "$MODE" = down ]; then down; exit 0; fi
if [ "$MODE" = x11 ]; then SESS=ubuntu-xorg; WL=false; else SESS=ubuntu; WL=true; fi

# 素の確認用セッション（vm-session.sh）が残っていれば止める（PipeWire・ポータルが重なる）
bash "$(dirname "$0")/vm-session.sh" down > /dev/null 2>&1
sudo systemctl stop gdm
sleep 2

# 1. 画面の装置（vkms）。mutter は vkms を試験用として無視する（61-mutter.rules の mutter-device-ignore。Wayland が
#    「No GPUs found」で上がらず GDM が X11 に戻す）。タグは後の規則で外しても TAGS に残るので、この VM では
#    /etc に同名の規則を置いて vkms の行だけ抜き、装置を作り直す
R=/etc/udev/rules.d/61-mutter.rules
if ! [ -e $R ]; then
  grep -v 'platform-vkms' /usr/lib/udev/rules.d/61-mutter.rules | sudo tee $R > /dev/null
  sudo udevadm control --reload
fi
if [ -e /dev/dri/card0 ] && udevadm info /dev/dri/card0 | grep -q 'TAGS=.*mutter-device-ignore'; then sudo modprobe -r vkms; fi
[ -e /dev/dri/card0 ] || sudo modprobe vkms
udevadm settle
for _ in $(seq 1 20); do [ "$(loginctl show-seat seat0 -p CanGraphical --value)" = yes ] && break; sleep 0.5; done
echo "seat0 CanGraphical=$(loginctl show-seat seat0 -p CanGraphical --value)"

# 2. 自動ログインと、入るセッション（AccountsService）
[ -e $CONF.nf-orig ] || sudo cp $CONF $CONF.nf-orig
printf '[daemon]\nAutomaticLoginEnable=true\nAutomaticLogin=%s\nWaylandEnable=%s\n[security]\n[xdmcp]\n[chooser]\n[debug]\n' "$U" "$WL" | sudo tee $CONF > /dev/null
printf '[User]\nSession=%s\nXSession=%s\nSystemAccount=false\n' "$SESS" "$SESS" | sudo tee /var/lib/AccountsService/users/$U > /dev/null
sudo systemctl restart accounts-daemon

# 3. 初回ログインの案内・画面ロックを出さない（確認の邪魔になる）
mkdir -p ~/.config && echo yes > ~/.config/gnome-initial-setup-done
gsettings set org.gnome.desktop.session idle-delay 0
gsettings set org.gnome.desktop.screensaver lock-enabled false
# GPU の無い VM では xdg-desktop-portal-gnome（GTK4）が GL の描画で落ちることがあった → cairo で描かせる
systemctl --user set-environment GSK_RENDERER=cairo
systemctl --user unset-environment DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_SESSION_TYPE XDG_CURRENT_DESKTOP 2>/dev/null
systemctl --user restart pipewire.socket pipewire-pulse.socket 2>/dev/null

# 4. GDM を起こし、自動ログインのセッションが seat0 の前面に出るのを待つ
sudo systemctl start gdm
active_sid() {
  local s
  s=$(loginctl show-seat seat0 -p ActiveSession --value)
  [ -n "$s" ] && [ "$(loginctl show-session "$s" -p Name --value)" = "$U" ] && [ "$(loginctl show-session "$s" -p Class --value)" = user ] && echo "$s"
}
SID=
for _ in $(seq 1 120); do SID=$(active_sid) && [ -n "$SID" ] && break; sleep 1; done
[ -n "$SID" ] || { echo "自動ログインのセッションが出ない"; sudo journalctl -u gdm --since -3min --no-pager | tail -20; exit 1; }

# 5. gnome-shell が上がり、gnome-session が環境を渡すのを待つ
want='^DISPLAY='
[ "$MODE" = wayland ] && want='^WAYLAND_DISPLAY='
for _ in $(seq 1 120); do
  E=$(systemctl --user show-environment)
  if echo "$E" | grep -q "^XDG_SESSION_TYPE=$MODE" && echo "$E" | grep -q "$want" \
    && gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.freedesktop.DBus.Properties.Get org.gnome.Shell ShellVersion > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
# Wayland が上がらないと GDM は黙って X11 のセッションに入り直すので、前面のセッションと種類を確かめ直す
SID=$(active_sid)
TYPE=$(loginctl show-session "$SID" -p Type --value 2>/dev/null)
loginctl show-session "$SID" -p Id -p Type -p Class -p Desktop -p Service -p Seat -p State
if [ "$TYPE" != "$MODE" ]; then
  echo "GDM が $MODE ではなく ${TYPE:-不明} のセッションに入った"
  sudo journalctl -b --since -3min --no-pager | grep -E 'Failed to setup|No GPUs|Session never registered' | tail -5
  exit 1
fi
systemctl --user show-environment | grep -E '^(DISPLAY|WAYLAND_DISPLAY|XAUTHORITY|XDG_SESSION_TYPE|XDG_CURRENT_DESKTOP|XDG_SESSION_DESKTOP|DESKTOP_SESSION|GDMSESSION)=' > /tmp/nf-session.env
echo "DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS" >> /tmp/nf-session.env
echo "NF_LOGIND_SESSION=$SID" >> /tmp/nf-session.env
cat /tmp/nf-session.env
gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell -m org.freedesktop.DBus.Properties.Get org.gnome.Shell ShellVersion
