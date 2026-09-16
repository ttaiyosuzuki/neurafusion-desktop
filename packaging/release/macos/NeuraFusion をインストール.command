#!/bin/bash
# NeuraFusion Desktop — macOS インストーラ
# このファイルをダブルクリックすると、ターミナルが開いて導入が始まります。

set -uo pipefail
cd "$(dirname "$0")"

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; RST=$'\033[0m'

echo ""
echo "  NeuraFusion Desktop"
echo "  ──────────────────────────────────────────"
echo ""

TGZ="$(ls -1 neurafusion-desktop-*.tgz 2>/dev/null | head -1)"
if [ -z "$TGZ" ]; then
  echo "${RED}本体のファイルが見つかりません。${RST}"
  echo "ダウンロードした zip を展開してから、この中の .command を実行してください。"
  echo ""
  read -r -p "Enter キーで閉じます " _
  exit 1
fi

# Node の確認 ------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "${RED}Node.js が入っていません。${RST}"
  echo ""
  echo "  先に Node.js 24 以上を入れてください:"
  echo "    https://nodejs.org/  （LTS を選んでください）"
  echo ""
  read -r -p "Enter キーで閉じます " _
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "${RED}Node.js のバージョンが足りません（今: v$(node -v | tr -d v)）。${RST}"
  echo "  24 以上が必要です: https://nodejs.org/"
  echo ""
  read -r -p "Enter キーで閉じます " _
  exit 1
fi

echo "  Node.js $(node -v) を確認しました。"
echo "  導入します。数分かかります…"
echo ""

if ! npm install -g "./$TGZ"; then
  echo ""
  echo "${YLW}権限のエラーで失敗した場合は、次を試してください:${RST}"
  echo "    sudo npm install -g \"$(pwd)/$TGZ\""
  echo ""
  read -r -p "Enter キーで閉じます " _
  exit 1
fi

echo ""
echo "${GRN}  導入できました。${RST}"
echo ""
echo "  ターミナルで次を打つと始まります:"
echo "      neurafusion onboard"
echo ""
echo "  鍵はこの端末の Keychain に入ります。当社は預かりません。"
echo ""
read -r -p "Enter キーで閉じます " _
