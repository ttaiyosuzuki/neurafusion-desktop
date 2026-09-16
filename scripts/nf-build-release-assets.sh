#!/usr/bin/env bash
# NeuraFusion Desktop — 3OS 配布アセットの組み立て
#
#   使い方:  bash scripts/nf-build-release-assets.sh
#
# 先に本体の tarball が要ります:
#   node scripts/package-openclaw-for-docker.mjs --allow-unreleased-changelog
#
# 出力先: .artifacts/release/
#   NeuraFusion-Desktop-<ver>-macos.zip
#   NeuraFusion-Desktop-<ver>-linux.tar.gz
#   NeuraFusion-Desktop-<ver>-windows.zip
#   SHA256SUMS.txt

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SRC_TGZ="$(ls -1 .artifacts/docker-e2e-package/openclaw-*.tgz 2>/dev/null | head -1 || true)"
if [ -z "$SRC_TGZ" ]; then
  echo "本体の tarball がありません。先にこれを実行してください:" >&2
  echo "  node scripts/package-openclaw-for-docker.mjs --allow-unreleased-changelog" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
OUT_DIR="$ROOT_DIR/.artifacts/release"
STAGE_ROOT="$ROOT_DIR/.artifacts/release-stage"
PKG_NAME="neurafusion-desktop-${VERSION}.tgz"

rm -rf "$OUT_DIR" "$STAGE_ROOT"
mkdir -p "$OUT_DIR" "$STAGE_ROOT"

echo "==> 本体: $SRC_TGZ  (v$VERSION)"

# 共通で同梱する文書
COMMON_DOCS=(LICENSE NOTICE THREAT_MODEL.md)

stage_one() {
  local os="$1" dirname="$2"
  local stage="$STAGE_ROOT/$dirname"
  mkdir -p "$stage"
  cp "$SRC_TGZ" "$stage/$PKG_NAME"
  for f in "${COMMON_DOCS[@]}"; do
    [ -f "$ROOT_DIR/$f" ] && cp "$ROOT_DIR/$f" "$stage/"
  done
  cp -R "$ROOT_DIR/packaging/release/$os/." "$stage/"
  echo "$stage"
}

# ── macOS ───────────────────────────────────────────────────────────
DIR="NeuraFusion-Desktop-${VERSION}-macos"
STAGE="$(stage_one macos "$DIR")"
chmod +x "$STAGE"/*.command
( cd "$STAGE_ROOT" && zip -q -r -X "$OUT_DIR/${DIR}.zip" "$DIR" )
echo "==> macOS   ${DIR}.zip"

# ── Linux ───────────────────────────────────────────────────────────
DIR="NeuraFusion-Desktop-${VERSION}-linux"
STAGE="$(stage_one linux "$DIR")"
chmod +x "$STAGE/install.sh"
( cd "$STAGE_ROOT" && tar czf "$OUT_DIR/${DIR}.tar.gz" "$DIR" )
echo "==> Linux   ${DIR}.tar.gz"

# ── Windows ─────────────────────────────────────────────────────────
DIR="NeuraFusion-Desktop-${VERSION}-windows"
STAGE="$(stage_one windows "$DIR")"
( cd "$STAGE_ROOT" && zip -q -r -X "$OUT_DIR/${DIR}.zip" "$DIR" )
echo "==> Windows ${DIR}.zip"

# ── 指紋 ────────────────────────────────────────────────────────────
( cd "$OUT_DIR" && shasum -a 256 ./* > SHA256SUMS.txt 2>/dev/null || sha256sum ./* > SHA256SUMS.txt )
# 自分自身の行を落とす
( cd "$OUT_DIR" && grep -v 'SHA256SUMS.txt' SHA256SUMS.txt > .tmp && mv .tmp SHA256SUMS.txt )

rm -rf "$STAGE_ROOT"

echo ""
echo "==> できました: $OUT_DIR"
ls -lh "$OUT_DIR"
echo ""
cat "$OUT_DIR/SHA256SUMS.txt"
