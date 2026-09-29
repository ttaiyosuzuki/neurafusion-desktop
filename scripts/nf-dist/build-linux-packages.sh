#!/usr/bin/env bash
# NeuraFusion Desktop 配布形式（DK-09）— Linux の .deb と AppImage（x86_64）。Linux の上で動かす。
#
#   bash scripts/nf-dist/build-linux-packages.sh [deb] [appimage]   # 既定は両方
#
# 要るもの: dpkg-deb（.deb）、appimagetool（AppImage。MIT。無ければ公式の continuous 版を取る。NF_APPIMAGETOOL で指定）
# 中身: /opt/neurafusion に Node 24（linux-x64）・ランチャー・npm tarball・丸の本体（apps/nf-overlay-linux。
#       Python + GTK は OS の物を使う＝.deb の Depends、AppImage は同じ物が入っている前提）
# 丸の本体は apps/nf-overlay-linux（DK-08）。まだ main に無ければ NF_LINUX_OVERLAY_DIR で場所を渡す。
# Mac では作らない（オーナー 2026-09-29: Linux 版は GitHub Actions の Linux ランナーで作る。入口は README の「Linux 版の作り方」）。
set -euo pipefail
if [ "$(uname -s)" != Linux ] || [ "$(uname -m)" != x86_64 ]; then
  echo "Linux 版は Linux（x86_64）の上で作ります。この機械は $(uname -s)/$(uname -m) です（CI の Linux ランナーで動かす）" >&2
  exit 2
fi
for c in dpkg-deb curl tar xz file; do
  command -v "$c" >/dev/null 2>&1 || { echo "要るコマンドがありません: $c（Ubuntu: sudo apt-get install -y dpkg curl tar xz-utils file）" >&2; exit 2; }
done
command -v node >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1 || { echo "node か python3 が要ります" >&2; exit 2; }
source "$(dirname "$0")/common.sh"
require_tgz

KINDS=("$@")
[ ${#KINDS[@]} -gt 0 ] || KINDS=(deb appimage)
DEB_VERSION="$(echo "$VERSION" | sed 's/-/~/g')"
OVERLAY_SRC="${NF_LINUX_OVERLAY_DIR:-$ROOT_DIR/apps/nf-overlay-linux}"
# DK-08 の README に書かれた実行時の OS パッケージ（Ubuntu 24.04 の名前）
DEPENDS="python3, python3-gi, gir1.2-gtk-3.0, gir1.2-wnck-3.0, gir1.2-atspi-2.0, at-spi2-core, tesseract-ocr, tesseract-ocr-jpn"
RECOMMENDS="gir1.2-webkit2-4.1"

# /opt/neurafusion の中身を $1 に置く
stage_payload() {
  local dir="$1"
  stage_common "$dir"
  cp "$ROOT_DIR/packaging/installer/icons/neurafusion-256.png" "$dir/neurafusion.png"
  bash "$ROOT_DIR/scripts/nf-dist/fetch-node.sh" linux-x64 "$dir/node" >/dev/null
  if [ -x "$OVERLAY_SRC/nf-overlay" ]; then
    mkdir -p "$dir/overlay"
    cp "$OVERLAY_SRC/nf-overlay" "$dir/overlay/"
    cp -R "$OVERLAY_SRC/nf_overlay" "$dir/overlay/"
    find "$dir/overlay" -name '__pycache__' -prune -exec rm -rf {} +
    write_manifest "$dir" "overlay/nf-overlay"
  else
    echo "==> 丸の本体（apps/nf-overlay-linux）が無いので、CLI だけで作ります" >&2
    write_manifest "$dir" ""
  fi
}

desktop_entry() {
  cat <<EOF
[Desktop Entry]
Type=Application
Name=NeuraFusion
Comment=AI アプリの右下に丸を重ね、押すと検品パネルを開く
Exec=$1
Icon=$2
Terminal=false
Categories=Utility;
StartupNotify=false
EOF
}

build_deb() {
  local root="$STAGE_ROOT/linux-deb"
  rm -rf "$root"
  mkdir -p "$root/DEBIAN" "$root/opt" "$root/usr/bin" "$root/usr/share/applications" "$root/usr/share/icons/hicolor/256x256/apps"
  stage_payload "$root/opt/neurafusion"
  cat > "$root/usr/bin/neurafusion-desktop" <<'EOF'
#!/bin/sh
# NeuraFusion Desktop の入口（DK-09）。同梱の Node 24 でランチャーを動かすだけ。
export NF_DIST_RESOURCES=/opt/neurafusion
exec /opt/neurafusion/node/bin/node /opt/neurafusion/nf-launch.mjs "$@"
EOF
  chmod 755 "$root/usr/bin/neurafusion-desktop"
  desktop_entry /usr/bin/neurafusion-desktop neurafusion-desktop > "$root/usr/share/applications/neurafusion-desktop.desktop"
  cp "$ROOT_DIR/packaging/installer/icons/neurafusion-256.png" "$root/usr/share/icons/hicolor/256x256/apps/neurafusion-desktop.png"
  local size; size="$(du -sk "$root/opt" | awk '{print $1}')"
  cat > "$root/DEBIAN/control" <<EOF
Package: neurafusion-desktop
Version: $DEB_VERSION
Section: utils
Priority: optional
Architecture: amd64
Maintainer: NeuraFusion <noreply@neurafusion.invalid>
Installed-Size: $size
Depends: $DEPENDS
Recommends: $RECOMMENDS
Homepage: https://github.com/ttaiyosuzuki/neurafusion-desktop
Description: NeuraFusion Desktop (AI アプリの右下の丸と検品パネル)
 Node.js 24 を同梱する。初回に開いたとき、本体を本人のデータの置き場
 (~/.local/share/neurafusion) に入れる。読んだ文字は端末の中だけで扱う。
EOF
  chmod -R u+rwX,go+rX,go-w "$root"
  local out="$OUT_DIR/neurafusion-desktop_${DEB_VERSION}_amd64.deb"
  rm -f "$out"
  dpkg-deb --root-owner-group -Zxz --build "$root" "$out" >/dev/null
  record_artifact "$out"
}

build_appimage() {
  local tool="${NF_APPIMAGETOOL:-$(command -v appimagetool || true)}"
  if [ -z "$tool" ]; then
    tool="$ROOT_DIR/.artifacts/appimagetool-x86_64.AppImage"
    [ -x "$tool" ] || { curl -fsSL -o "$tool" https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage && chmod +x "$tool"; }
  fi
  local appdir="$STAGE_ROOT/linux-appimage/NeuraFusion.AppDir"
  rm -rf "$STAGE_ROOT/linux-appimage"
  mkdir -p "$appdir/usr/share/applications"
  stage_payload "$appdir/opt/neurafusion"
  cat > "$appdir/AppRun" <<'EOF'
#!/bin/sh
# NeuraFusion の AppImage の入口（DK-09）
HERE="$(dirname "$(readlink -f "$0")")"
export NF_DIST_RESOURCES="$HERE/opt/neurafusion"
exec "$HERE/opt/neurafusion/node/bin/node" "$HERE/opt/neurafusion/nf-launch.mjs" "$@"
EOF
  chmod 755 "$appdir/AppRun"
  desktop_entry neurafusion-desktop neurafusion-desktop > "$appdir/neurafusion-desktop.desktop"
  cp "$appdir/neurafusion-desktop.desktop" "$appdir/usr/share/applications/"
  cp "$ROOT_DIR/packaging/installer/icons/neurafusion-256.png" "$appdir/neurafusion-desktop.png"
  local out="$OUT_DIR/NeuraFusion-Desktop-$VERSION-x86_64.AppImage"
  rm -f "$out"
  # FUSE の無い環境（VM・CI）でも動くよう、道具は展開して動かす
  ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$tool" --no-appstream "$appdir" "$out" >"$STAGE_ROOT/appimagetool.log" 2>&1 \
    || { tail -20 "$STAGE_ROOT/appimagetool.log" >&2; exit 1; }
  record_artifact "$out"
}

for k in "${KINDS[@]}"; do
  case "$k" in
    deb) build_deb ;;
    appimage) build_appimage ;;
    *) echo "知らない種類: $k" >&2; exit 2 ;;
  esac
done
