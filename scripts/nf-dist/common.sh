# NeuraFusion Desktop 配布形式（DK-09）— 3 OS のスクリプトが共通で使う値と関数。source して使う。
# 出力先はすべて .artifacts/installers/（.gitignore 下。リポジトリには入れない）。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || sed -n 's/^  "version": "\(.*\)",$/\1/p' "$ROOT_DIR/package.json" | head -1)"
PACKAGE_NAME="neurafusion"
OUT_DIR="$ROOT_DIR/.artifacts/installers"
STAGE_ROOT="$ROOT_DIR/.artifacts/installers-stage"
mkdir -p "$OUT_DIR" "$STAGE_ROOT"

# 本体の npm tarball（scripts/package-openclaw-for-docker.mjs の出力）。NF_DIST_TGZ で上書きできる。
find_tgz() {
  if [ -n "${NF_DIST_TGZ:-}" ]; then echo "$NF_DIST_TGZ"; return; fi
  ls -1 "$ROOT_DIR"/.artifacts/docker-e2e-package/{neurafusion,openclaw}-*.tgz 2>/dev/null | head -1 || true
}

require_tgz() {
  TGZ="$(find_tgz)"
  if [ -z "$TGZ" ] || [ ! -f "$TGZ" ]; then
    echo "本体の tarball がありません。先に: node scripts/package-openclaw-for-docker.mjs --allow-unreleased-changelog" >&2
    echo "（別の場所にあれば NF_DIST_TGZ=<パス>）" >&2
    exit 1
  fi
}

# 同梱物の一覧（ランチャーが読む）。$1=置き場 $2=丸の本体の相対パス（無ければ空）
write_manifest() {
  local dir="$1" overlay="${2:-}"
  node -e '
    const [dir, version, pkg, tgz, overlay] = process.argv.slice(1);
    const m = { version, packageName: pkg, tgz, ...(overlay ? { overlayBin: overlay } : {}) };
    require("fs").writeFileSync(require("path").join(dir, "nf-dist.json"), JSON.stringify(m, null, 2) + "\n");
  ' "$dir" "$VERSION" "$PACKAGE_NAME" "$(basename "$TGZ")" "$overlay"
}

# 共通の同梱物（ランチャー・tarball・文書）を $1 に置く
stage_common() {
  local dir="$1"
  mkdir -p "$dir"
  cp "$ROOT_DIR/packaging/installer/nf-launch.mjs" "$dir/"
  cp "$TGZ" "$dir/"
  for f in LICENSE NOTICE THREAT_MODEL.md; do
    [ -f "$ROOT_DIR/$f" ] && cp "$ROOT_DIR/$f" "$dir/"
  done
  # 中に置く名前は ASCII（Mac の HFS+ は日本語の名前を NFD に変え、.app の署名の封と食い違うため）
  cp "$ROOT_DIR/packaging/installer/はじめにお読みください.txt" "$dir/README-ja.txt"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

# できた物の場所・大きさ・SHA-256 を SHA256SUMS.txt に足す
record_artifact() {
  local f="$1"
  local sum; sum="$(sha256_of "$f")"
  local name; name="$(basename "$f")"
  touch "$OUT_DIR/SHA256SUMS.txt"
  grep -v "  $name\$" "$OUT_DIR/SHA256SUMS.txt" > "$OUT_DIR/.sums.tmp" || true
  echo "$sum  $name" >> "$OUT_DIR/.sums.tmp"
  sort -k2 "$OUT_DIR/.sums.tmp" > "$OUT_DIR/SHA256SUMS.txt"
  rm -f "$OUT_DIR/.sums.tmp"
  echo "==> $f  $(du -h "$f" | awk '{print $1}')  sha256=$sum"
}
