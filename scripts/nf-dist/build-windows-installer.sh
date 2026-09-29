#!/usr/bin/env bash
# NeuraFusion Desktop 配布形式（DK-09）— Windows のインストーラ（.exe。NSIS 3）。Mac・Linux で作れる。
#
#   bash scripts/nf-dist/build-windows-installer.sh
#
# 要るもの: makensis（NSIS 3。zlib/libpng ライセンス。Mac は brew install makensis）、
#           .NET 8 SDK（丸の本体 nf-overlay.exe を win-x64・自己完結・1ファイルで書き出す。NF_DOTNET で場所を指定）
# 中身: Node 24（win-x64）・ランチャー・npm tarball・丸の本体（.NET ランタイムごと。別に入れる物を無くす）
# 署名はしない（証明書の購入待ち。docs/overlay-windows-signing.md）。
set -euo pipefail
source "$(dirname "$0")/common.sh"
require_tgz

DOTNET="${NF_DOTNET:-$(command -v dotnet || echo "$HOME/.dotnet/dotnet")}"
MAKENSIS="${NF_MAKENSIS:-$(command -v makensis || true)}"
[ -n "$MAKENSIS" ] || { echo "makensis がありません（NSIS 3 を入れてください）" >&2; exit 1; }

STAGE="$STAGE_ROOT/windows"
rm -rf "$STAGE"
stage_common "$STAGE"
cp "$ROOT_DIR/packaging/installer/icons/neurafusion.ico" "$STAGE/"
bash "$ROOT_DIR/scripts/nf-dist/fetch-node.sh" win-x64 "$STAGE/node" >/dev/null

# 丸の本体（Mac でも EnableWindowsTargeting で書き出せる）
"$DOTNET" publish "$ROOT_DIR/apps/nf-overlay-windows/src/NfOverlay.Win/NfOverlay.Win.csproj" \
  -c Release -r win-x64 --self-contained true \
  -p:EnableWindowsTargeting=true -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true \
  -p:DebugType=none -p:GenerateDocumentationFile=false \
  -o "$STAGE_ROOT/windows-overlay" >"$STAGE_ROOT/windows-overlay.log" 2>&1 \
  || { tail -20 "$STAGE_ROOT/windows-overlay.log" >&2; exit 1; }
mkdir -p "$STAGE/overlay"
cp "$STAGE_ROOT/windows-overlay/nf-overlay.exe" "$STAGE/overlay/"
write_manifest "$STAGE" "overlay/nf-overlay.exe"

OUT="$OUT_DIR/NeuraFusion-Desktop-$VERSION-windows-x64-Setup.exe"
rm -f "$OUT"
"$MAKENSIS" -V2 -INPUTCHARSET UTF8 \
  "-DSTAGE=$STAGE" "-DOUTFILE=$OUT" "-DVERSION=$VERSION" \
  "$ROOT_DIR/packaging/installer/windows/neurafusion.nsi"
record_artifact "$OUT"
