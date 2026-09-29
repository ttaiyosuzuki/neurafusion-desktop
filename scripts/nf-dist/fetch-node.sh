#!/usr/bin/env bash
# NeuraFusion Desktop 配布形式（DK-09）— 同梱する Node 24 を nodejs.org の公式配布物から取る。
#
#   bash scripts/nf-dist/fetch-node.sh <darwin-x64|darwin-arm64|win-x64|linux-x64|linux-arm64> <出力先>
#
# SHASUMS256.txt と照らしてから展開する（合わなければ止まる）。取得物は .artifacts/node-cache に残す。
# Node は MIT ライセンス（同梱物の LICENSE をそのまま入れる）。
set -euo pipefail

NODE_VERSION="${NF_NODE_VERSION:-v24.21.0}"
TARGET="${1:?target が要ります}"
OUT="${2:?出力先が要ります}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE="$ROOT_DIR/.artifacts/node-cache/$NODE_VERSION"
BASE="https://nodejs.org/dist/$NODE_VERSION"
mkdir -p "$CACHE"

case "$TARGET" in
  win-x64) FILE="node-$NODE_VERSION-win-x64.zip" ;;
  darwin-*|linux-*) FILE="node-$NODE_VERSION-$TARGET.tar.gz" ;;
  *) echo "知らない target: $TARGET" >&2; exit 2 ;;
esac

[ -f "$CACHE/SHASUMS256.txt" ] || curl -fsSL "$BASE/SHASUMS256.txt" -o "$CACHE/SHASUMS256.txt"
[ -f "$CACHE/$FILE" ] || curl -fsSL "$BASE/$FILE" -o "$CACHE/$FILE"

WANT="$(awk -v f="$FILE" '$2 == f { print $1 }' "$CACHE/SHASUMS256.txt")"
if command -v sha256sum >/dev/null 2>&1; then GOT="$(sha256sum "$CACHE/$FILE" | awk '{print $1}')"
else GOT="$(shasum -a 256 "$CACHE/$FILE" | awk '{print $1}')"; fi
if [ -z "$WANT" ] || [ "$WANT" != "$GOT" ]; then
  echo "SHA-256 が合いません: $FILE" >&2
  rm -f "$CACHE/$FILE"
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"
TMP="$(mktemp -d)"
case "$FILE" in
  *.zip) unzip -q "$CACHE/$FILE" -d "$TMP" ;;
  *) tar xzf "$CACHE/$FILE" -C "$TMP" ;;
esac
SRC="$TMP/${FILE%.tar.gz}"
SRC="${SRC%.zip}"
# 同梱に要る物だけ（ヘッダ・man・corepack の shim は入れない）
if [ "$TARGET" = "win-x64" ]; then
  cp "$SRC/node.exe" "$SRC/LICENSE" "$OUT/"
  mkdir -p "$OUT/node_modules"
  cp -R "$SRC/node_modules/npm" "$OUT/node_modules/npm"
else
  mkdir -p "$OUT/bin" "$OUT/lib/node_modules"
  cp "$SRC/bin/node" "$OUT/bin/node"
  cp "$SRC/LICENSE" "$OUT/LICENSE"
  cp -R "$SRC/lib/node_modules/npm" "$OUT/lib/node_modules/npm"
fi
rm -rf "$TMP"
echo "node $NODE_VERSION ($TARGET) -> $OUT  sha256=$GOT"
