#!/usr/bin/env bash
# NeuraFusion Desktop — Linux インストーラ
#   chmod +x install.sh && ./install.sh

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
  echo "ダウンロードした tar.gz を展開したフォルダの中で実行してください。"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "${RED}Node.js が入っていません。${RST}"
  echo ""
  echo "  Debian / Ubuntu:"
  echo "    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -"
  echo "    sudo apt-get install -y nodejs"
  echo ""
  echo "  Fedora:   sudo dnf install nodejs"
  echo "  Arch:     sudo pacman -S nodejs npm"
  echo ""
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "${RED}Node.js のバージョンが足りません（今: $(node -v)）。24 以上が必要です。${RST}"
  exit 1
fi

echo "  Node.js $(node -v) を確認しました。"
echo "  導入します。数分かかります…"
echo ""

if ! npm install -g "./$TGZ"; then
  echo ""
  echo "${YLW}権限のエラーで失敗した場合:${RST}"
  echo "    sudo npm install -g \"$(pwd)/$TGZ\""
  echo ""
  echo "  sudo を使いたくない場合は、先に npm の導入先を自分の home に変えてください:"
  echo "    npm config set prefix ~/.local"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  exit 1
fi

echo ""
echo "${GRN}  導入できました。${RST}"
echo ""
echo "  次を打つと始まります:"
echo "      neurafusion onboard"
echo ""
echo "  鍵はこの端末の Secret Service（GNOME Keyring / KWallet）に入ります。"
echo "  当社は預かりません。"
echo ""
