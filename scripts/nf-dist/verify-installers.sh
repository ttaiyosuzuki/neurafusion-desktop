#!/usr/bin/env bash
# NeuraFusion Desktop 配布形式（DK-09・TS-38）— 書き出した物の中身を確かめる。
#
#   bash scripts/nf-dist/verify-installers.sh [dmg] [exe] [deb] [appimage]   # 既定はこの OS で確かめられる物すべて
#   NF_DIST_SMOKE=1 …   # さらに、同梱の Node で本体を実際に入れて `--version` を動かす（インターネットが要る・数分）
#
# .dmg は Mac、.deb・AppImage は Linux で確かめる。Windows のインストーラは実行できないので、形（PE・NSIS・同梱物）だけ。
set -uo pipefail
source "$(dirname "$0")/common.sh"

FAIL=0
ok() { echo "ok   $*"; }
ng() { echo "NG   $*"; FAIL=1; }
has() { [ -e "$1" ] && ok "$2" || ng "$2（無い: $1）"; }

KINDS=("$@")
if [ ${#KINDS[@]} -eq 0 ]; then
  case "$(uname -s)" in Darwin) KINDS=(dmg exe) ;; Linux) KINDS=(deb appimage exe) ;; *) KINDS=(exe) ;; esac
fi

smoke() { # $1=入口 $2=名前
  [ "${NF_DIST_SMOKE:-}" = 1 ] || return 0
  local data; data="$(mktemp -d)"
  local v
  v="$(NF_DIST_DATA_DIR="$data" "$1" --version 2>"$data/err.log" | tail -1)"
  if echo "$v" | grep -q "$VERSION"; then ok "$2: 同梱の Node で本体を入れ、--version が動く（$v）"
  else ng "$2: --version が動かない（$(tail -3 "$data/err.log" | tr '\n' ' ')）"; fi
  local again; again="$(NF_DIST_DATA_DIR="$data" "$1" --version 2>&1 >/dev/null | grep -c '初回の準備' || true)"
  [ "$again" = 0 ] && ok "$2: 2回目は入れ直さない" || ng "$2: 2回目も入れ直した"
  rm -rf "$data"
}

verify_dmg() {
  for dmg in "$OUT_DIR"/NeuraFusion-Desktop-"$VERSION"-macos-*.dmg; do
    [ -f "$dmg" ] || { ng ".dmg が無い"; return; }
    local name; name="$(basename "$dmg")"
    hdiutil verify -quiet "$dmg" && ok "$name: hdiutil verify" || ng "$name: hdiutil verify"
    local mnt; mnt="$(mktemp -d)"
    hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mnt" "$dmg" || { ng "$name: マウントできない"; continue; }
    local app="$mnt/NeuraFusion.app"
    has "$app/Contents/MacOS/NeuraFusion" "$name: 入口"
    has "$app/Contents/Resources/node/bin/node" "$name: 同梱の Node"
    has "$app/Contents/Resources/node/lib/node_modules/npm/bin/npm-cli.js" "$name: 同梱の npm"
    has "$app/Contents/Resources/nf-launch.mjs" "$name: ランチャー"
    has "$app/Contents/Resources/NFOverlay.app/Contents/MacOS/nf-overlay" "$name: 丸の本体"
    has "$app/Contents/Resources/$PACKAGE_NAME-$VERSION.tgz" "$name: 本体の tarball"
    has "$mnt/アプリケーション" "$name: アプリケーションへの別名"
    local arch; arch="${name##*-}"; arch="${arch%.dmg}"; [ "$arch" = x64 ] && arch=x86_64
    file "$app/Contents/Resources/node/bin/node" | grep -q "$arch" && ok "$name: Node は $arch" || ng "$name: Node のアーキテクチャ違い"
    lipo -archs "$app/Contents/Resources/NFOverlay.app/Contents/MacOS/nf-overlay" | grep -q "$arch" && ok "$name: 丸は $arch を含む" || ng "$name: 丸に $arch が無い"
    codesign --verify --strict "$app" 2>/dev/null && ok "$name: 署名の検証（アドホック）" || ng "$name: 署名の検証"
    /usr/libexec/PlistBuddy -c "Print :NSAccessibilityUsageDescription" "$app/Contents/Info.plist" >/dev/null 2>&1 && ok "$name: アクセシビリティの理由" || ng "$name: アクセシビリティの理由が無い"
    if [ "$(uname -m)" = "$arch" ]; then smoke "$app/Contents/MacOS/NeuraFusion" "$name"; fi
    hdiutil detach -quiet "$mnt" || true
    rmdir "$mnt" 2>/dev/null || true
  done
}

verify_exe() {
  local exe="$OUT_DIR/NeuraFusion-Desktop-$VERSION-windows-x64-Setup.exe"
  [ -f "$exe" ] || { ng "Windows のインストーラが無い"; return; }
  local name; name="$(basename "$exe")"
  [ "$(head -c 2 "$exe")" = "MZ" ] && ok "$name: PE（MZ）" || ng "$name: PE ではない"
  grep -a -q "Nullsoft" "$exe" && ok "$name: NSIS のインストーラ" || ng "$name: NSIS の印が無い"
  local z; z="$(command -v 7zz || command -v 7z || true)"
  if [ -n "$z" ]; then
    local list; list="$("$z" l "$exe" 2>/dev/null)"
    for f in "node/node.exe" "nf-launch.mjs" "nf-dist.json" "overlay/nf-overlay.exe" "$PACKAGE_NAME-$VERSION.tgz"; do
      grep -qF -- "$f" <<<"$list" && ok "$name: 同梱 $f" || ng "$name: $f が無い"
    done
  else
    echo "--   $name: 7z が無いので同梱物の一覧は飛ばす（形だけ確かめた）"
  fi
}

verify_deb() {
  local deb; deb="$(ls -1 "$OUT_DIR"/neurafusion-desktop_*_amd64.deb 2>/dev/null | head -1)"
  [ -n "$deb" ] || { ng ".deb が無い"; return; }
  local name; name="$(basename "$deb")"
  dpkg-deb --info "$deb" > "$STAGE_ROOT/deb-info.txt" 2>&1 && ok "$name: dpkg-deb --info" || ng "$name: dpkg-deb --info"
  grep -q "Package: neurafusion-desktop" "$STAGE_ROOT/deb-info.txt" && ok "$name: Package" || ng "$name: Package"
  grep -q "Depends:.*python3-gi" "$STAGE_ROOT/deb-info.txt" && ok "$name: Depends（丸の本体の OS パッケージ）" || ng "$name: Depends"
  dpkg-deb --contents "$deb" > "$STAGE_ROOT/deb-contents.txt" 2>&1
  for f in ./usr/bin/neurafusion-desktop ./opt/neurafusion/node/bin/node ./opt/neurafusion/nf-launch.mjs ./opt/neurafusion/overlay/nf-overlay ./usr/share/applications/neurafusion-desktop.desktop; do
    grep -q " $f\$" "$STAGE_ROOT/deb-contents.txt" && ok "$name: $f" || ng "$name: $f が無い"
  done
  if [ "${NF_DIST_SMOKE:-}" = 1 ]; then
    local x; x="$(mktemp -d)"
    dpkg-deb -x "$deb" "$x"
    sed "s#/opt/neurafusion#$x/opt/neurafusion#g" "$x/usr/bin/neurafusion-desktop" > "$x/entry" && chmod +x "$x/entry"
    smoke "$x/entry" "$name"
    rm -rf "$x"
  fi
}

verify_appimage() {
  local img="$OUT_DIR/NeuraFusion-Desktop-$VERSION-x86_64.AppImage"
  [ -f "$img" ] || { ng "AppImage が無い"; return; }
  local name; name="$(basename "$img")"
  file "$img" | grep -q "ELF 64-bit" && ok "$name: ELF 64-bit" || ng "$name: ELF ではない"
  [ -x "$img" ] || chmod +x "$img"
  local x; x="$(mktemp -d)"
  ( cd "$x" && "$img" --appimage-extract >/dev/null 2>&1 ) && ok "$name: 展開できる" || ng "$name: 展開できない"
  has "$x/squashfs-root/AppRun" "$name: AppRun"
  has "$x/squashfs-root/opt/neurafusion/overlay/nf-overlay" "$name: 丸の本体"
  rm -rf "$x"
  APPIMAGE_EXTRACT_AND_RUN=1 smoke "$img" "$name"
}

for k in "${KINDS[@]}"; do
  case "$k" in
    dmg) verify_dmg ;;
    exe) verify_exe ;;
    deb) verify_deb ;;
    appimage) verify_appimage ;;
    *) ng "知らない種類: $k" ;;
  esac
done
echo "EXIT=$FAIL"
exit "$FAIL"
