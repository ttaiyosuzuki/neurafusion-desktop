#!/usr/bin/env bash
# NeuraFusion Desktop 配布形式（DK-09）— Mac の .dmg。
#
#   bash scripts/nf-dist/build-macos-dmg.sh [x64|arm64 ...]   # 既定は x64 と arm64 の両方
#
# 中身: NeuraFusion.app（入口。Node 24・ランチャー・npm tarball・丸の本体 NFOverlay.app を同梱）
#       ＋「アプリケーション」への別名＋はじめにお読みください.txt
# 署名: アドホック（Developer ID は登録待ち。NF_SIGN_IDENTITY があればそれで署名。値はキーチェーンの名前だけ）
set -euo pipefail
source "$(dirname "$0")/common.sh"
require_tgz

ARCHS=("$@")
[ ${#ARCHS[@]} -gt 0 ] || ARCHS=(x64 arm64)
SIGN="${NF_SIGN_IDENTITY:--}"

# 丸の本体（両方のアーキテクチャを1つに。できなければ今の Mac のアーキテクチャだけ）
OVERLAY_DIR="$ROOT_DIR/apps/nf-overlay-macos"
( cd "$OVERLAY_DIR" && swift build -c release --arch x86_64 --arch arm64 >/dev/null 2>&1 ) && UNIVERSAL=1 || UNIVERSAL=0
if [ "$UNIVERSAL" = 1 ]; then
  OVERLAY_BIN="$(cd "$OVERLAY_DIR" && swift build -c release --arch x86_64 --arch arm64 --show-bin-path)/nf-overlay"
else
  ( cd "$OVERLAY_DIR" && swift build -c release >/dev/null )
  OVERLAY_BIN="$(cd "$OVERLAY_DIR" && swift build -c release --show-bin-path)/nf-overlay"
fi
OVERLAY_ARCHS="$(lipo -archs "$OVERLAY_BIN")"
echo "==> 丸の本体: $OVERLAY_ARCHS"

for ARCH in "${ARCHS[@]}"; do
  case "$ARCH" in x64) LIPO_ARCH=x86_64 ;; arm64) LIPO_ARCH=arm64 ;; *) echo "知らない arch: $ARCH" >&2; exit 2 ;; esac
  if ! echo " $OVERLAY_ARCHS " | grep -q " $LIPO_ARCH "; then
    echo "==> $ARCH: 丸の本体をこのアーキテクチャ向けに作れないので飛ばします（Xcode の無い Mac では universal が作れない）" >&2
    continue
  fi
  STAGE="$STAGE_ROOT/macos-$ARCH"
  rm -rf "$STAGE"
  APP="$STAGE/NeuraFusion.app"
  RES="$APP/Contents/Resources"
  mkdir -p "$APP/Contents/MacOS" "$RES"

  stage_common "$RES"
  bash "$ROOT_DIR/scripts/nf-dist/fetch-node.sh" "darwin-$ARCH" "$RES/node" >/dev/null

  # 丸の本体（NFOverlay.app。apps/nf-overlay-macos/scripts/package-app.sh と同じ形）
  OAPP="$RES/NFOverlay.app"
  mkdir -p "$OAPP/Contents/MacOS"
  cp "$OVERLAY_BIN" "$OAPP/Contents/MacOS/nf-overlay"
  sed -e "s/@VERSION@/$VERSION/g" "$ROOT_DIR/packaging/installer/macos/NFOverlay-Info.plist" > "$OAPP/Contents/Info.plist"
  write_manifest "$RES" "NFOverlay.app/Contents/MacOS/nf-overlay"

  # 入口
  cp "$ROOT_DIR/packaging/installer/macos/NeuraFusion" "$APP/Contents/MacOS/NeuraFusion"
  chmod +x "$APP/Contents/MacOS/NeuraFusion"
  sed -e "s/@VERSION@/$VERSION/g" "$ROOT_DIR/packaging/installer/macos/Info.plist" > "$APP/Contents/Info.plist"

  # 署名（内側から）
  codesign --force --sign "$SIGN" "$RES/node/bin/node" 2>/dev/null || true
  codesign --force --sign "$SIGN" "$OAPP"
  codesign --force --sign "$SIGN" "$APP"
  codesign --verify --strict "$APP"

  # .dmg
  DMG_SRC="$STAGE/dmg"
  mkdir -p "$DMG_SRC"
  mv "$APP" "$DMG_SRC/"
  ln -s /Applications "$DMG_SRC/アプリケーション"
  cp "$ROOT_DIR/packaging/installer/はじめにお読みください.txt" "$DMG_SRC/"
  DMG="$OUT_DIR/NeuraFusion-Desktop-$VERSION-macos-$ARCH.dmg"
  rm -f "$DMG"
  hdiutil create -quiet -volname "NeuraFusion" -srcfolder "$DMG_SRC" -fs HFS+ -format UDZO -ov "$DMG"
  record_artifact "$DMG"
done
