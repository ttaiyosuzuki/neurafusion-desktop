# NeuraFusion Desktop 配布形式（DK-09）— 3 OS のスクリプトが共通で使う値と関数。source して使う。
# 出力先はすべて .artifacts/installers/（.gitignore 下。リポジトリには入れない）。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VERSION="$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || sed -n 's/^  "version": "\(.*\)",$/\1/p' "$ROOT_DIR/package.json" | head -1)"
PACKAGE_NAME="neurafusion"
OUT_DIR="$ROOT_DIR/.artifacts/installers"
STAGE_ROOT="$ROOT_DIR/.artifacts/installers-stage"
# 同梱物の権限を組み立てる人の umask に左右させない（077 だと .app の中身が本人以外に読めない）
umask 022
mkdir -p "$OUT_DIR" "$STAGE_ROOT"

# 本体の npm tarball。作るのは scripts/nf-dist/build-tgz.sh（package-openclaw-for-docker.mjs --pnpm-pack）。
# npm pack で作った物は bundleDependencies の @openclaw/ai が抜ける（検査で落ちても tarball は残る）ので、
# 候補（.artifacts/*/neurafusion-<版>.tgz のすべて）を中まで調べ、@openclaw/ai の無い物は使わない。
AI_RUNTIME_ENTRY="package/node_modules/@openclaw/ai/package.json"

# $1 の tarball に @openclaw/ai が入っているか（壊れていて読めない物も「入っていない」）
tgz_has_ai_runtime() {
  local n
  n="$(tar -tzf "$1" 2>/dev/null | grep -c -x -F -- "$AI_RUNTIME_ENTRY" || true)"
  [ "${n:-0}" -gt 0 ]
}

# 候補を新しい順に 1 行ずつ
tgz_candidates() {
  ls -1t "$ROOT_DIR"/.artifacts/*/"$PACKAGE_NAME-$VERSION.tgz" 2>/dev/null || true
}

# 使う tarball を TGZ に入れる。@openclaw/ai の入った候補のうち一番新しい物。
# NF_DIST_TGZ（上書き用）も同じ検査にかける。使える物が無ければ、配布物を作る前に非 0 で止まる。
require_tgz() {
  TGZ=""
  if [ -n "${NF_DIST_TGZ:-}" ]; then
    if [ ! -f "$NF_DIST_TGZ" ]; then
      echo "NF_DIST_TGZ のファイルがありません: $NF_DIST_TGZ" >&2
      exit 1
    fi
    if ! tgz_has_ai_runtime "$NF_DIST_TGZ"; then
      echo "NF_DIST_TGZ の tarball に @openclaw/ai が入っていません（npm pack で作った物？）: $NF_DIST_TGZ" >&2
      echo "作り直し: bash scripts/nf-dist/build-tgz.sh（--pnpm-pack。約 25 分）" >&2
      exit 1
    fi
    TGZ="$NF_DIST_TGZ"
  else
    local f skipped=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      if tgz_has_ai_runtime "$f"; then TGZ="$f"; break; fi
      echo "==> 使わない（@openclaw/ai が入っていない）: $f" >&2
      skipped=$((skipped + 1))
    done < <(tgz_candidates)
    if [ -z "$TGZ" ]; then
      echo "@openclaw/ai の入った本体の tarball（.artifacts/*/$PACKAGE_NAME-$VERSION.tgz）がありません（入っていない候補 ${skipped} 個）。配布物は作りません。" >&2
      echo "先に: bash scripts/nf-dist/build-tgz.sh（--pnpm-pack。約 25 分）" >&2
      exit 1
    fi
  fi
  echo "==> 本体の tarball: $TGZ" >&2
}

# 同梱物の一覧（ランチャーが読む）。$1=置き場 $2=丸の本体の相対パス（無ければ空）
write_manifest() {
  local dir="$1" overlay="${2:-}"
  if ! command -v node >/dev/null 2>&1; then
    # node の無い組み立て機（Linux の VM など）
    python3 -c '
import json, os, sys
d, version, pkg, tgz, overlay = sys.argv[1:6]
m = {"version": version, "packageName": pkg, "tgz": tgz}
if overlay: m["overlayBin"] = overlay
open(os.path.join(d, "nf-dist.json"), "w").write(json.dumps(m, indent=2) + "\n")
' "$dir" "$VERSION" "$PACKAGE_NAME" "$(basename "$TGZ")" "$overlay"
    return
  fi
  node -e '
    const [dir, version, pkg, tgz, overlay] = process.argv.slice(1);
    const m = { version, packageName: pkg, tgz, ...(overlay ? { overlayBin: overlay } : {}) };
    require("fs").writeFileSync(require("path").join(dir, "nf-dist.json"), JSON.stringify(m, null, 2) + "\n");
  ' "$dir" "$VERSION" "$PACKAGE_NAME" "$(basename "$TGZ")" "$overlay"
}

# 共通の同梱物（ランチャー・tarball・文書）を $1 に置く。ライセンス文書は stage_licenses
stage_common() {
  local dir="$1"
  mkdir -p "$dir"
  cp "$ROOT_DIR/packaging/installer/nf-launch.mjs" "$dir/"
  cp "$TGZ" "$dir/"
  cp "$ROOT_DIR/THREAT_MODEL.md" "$dir/"
  # 中に置く名前は ASCII（Mac の HFS+ は日本語の名前を NFD に変え、.app の署名の封と食い違うため）
  cp "$ROOT_DIR/packaging/installer/はじめにお読みください.txt" "$dir/README-ja.txt"
}

# ライセンス文書（配布物を外に出す前の確認。docs/desktop-installers-licenses.md）。
# $1=同梱物の置き場（同梱の Node を先に $1/node に置いておく） $2=macos|windows|linux|appimage
#   $1 の直下: 上流の LICENSE・NOTICE・THIRD_PARTY_NOTICES.md（LICENSE の末尾の1行がこの名前を指すので並べる）
#   $1/licenses/: 同梱した部品ごとの全文。.NET と WebView2 は build-windows-installer.sh が書き出しのあとに足す
# 置き終えたら finish_licenses で一覧（README.txt）と、全部をつないだ ALL.txt を書く。
stage_licenses() {
  local dir="$1" kind="$2" lic="$1/licenses"
  mkdir -p "$lic"
  cp "$ROOT_DIR/LICENSE" "$ROOT_DIR/NOTICE" "$ROOT_DIR/THIRD_PARTY_NOTICES.md" "$dir/"
  cp "$dir/node/LICENSE" "$lic/node-LICENSE.txt"
  case "$kind" in
    windows) cp "$ROOT_DIR/packaging/installer/licenses/nsis-COPYING.txt" \
      "$ROOT_DIR/packaging/installer/licenses/dotnet-library-license.txt" "$lic/" ;;
    appimage) cp "$ROOT_DIR/packaging/installer/licenses/appimage-type2-runtime-LICENSE.txt" "$lic/" ;;
  esac
}

license_description() {
  case "$1" in
    node-LICENSE.txt) echo "Node.js（同梱の node と npm。MIT。中に入っている V8・OpenSSL・ICU・libuv・npm（Artistic-2.0）ほかの表示を含む）" ;;
    nsis-COPYING.txt) echo "NSIS 3（インストーラの実行部分。zlib/libpng。LZMA の部分は Common Public License 1.0 と例外。ソースは NeuraFusion（info@taiyosuzuki.com）へ申し出れば nsis-3.13-src.tar.bz2 を送る。同じ物: https://sourceforge.net/projects/nsis/files/NSIS%203/3.13/）" ;;
    dotnet-runtime-LICENSE.txt) echo ".NET ランタイム（Microsoft.NETCore.App。丸の本体 nf-overlay.exe に同梱。MIT）" ;;
    dotnet-runtime-THIRD-PARTY-NOTICES.txt) echo ".NET ランタイムの中の第三者の表示" ;;
    dotnet-library-license.txt) echo "Microsoft .NET Library License（英語の原文。丸の本体 nf-overlay.exe に単一ファイルで入っている .NET ランタイム（coreclr.dll ほか）の条件。https://dotnet.microsoft.com/dotnet_library_license.htm・2026-09-30 取得）" ;;
    dotnet-windowsdesktop-LICENSE.txt) echo "Windows Desktop ランタイム（WPF・Windows Forms。丸の本体に同梱。MIT）" ;;
    webview2-LICENSE.txt) echo "Microsoft Edge WebView2 SDK（丸の本体のパネル。BSD 型: 再配布では著作権表示・条件・免責を文書に入れる）" ;;
    webview2-NOTICE.txt) echo "WebView2 SDK の中の第三者の表示" ;;
    appimage-type2-runtime-LICENSE.txt) echo "AppImage の runtime（AppImage の先頭の実行部分。MIT。musl・libfuse（LGPL-2.1）・squashfuse・zstd・zlib を静的に含む。ソース: https://github.com/AppImage/type2-runtime）" ;;
    *) echo "（説明なし）" ;;
  esac
}

# $1=同梱物の置き場 残り=一覧に書く版の行（例: "Node.js v24.21.0"）
finish_licenses() {
  local dir="$1" lic="$1/licenses" f name
  shift
  {
    echo "NeuraFusion Desktop $VERSION — ライセンスと著作権表示"
    echo
    echo "このフォルダの 1 つ上に、本体のライセンス（LICENSE）・由来と著作権表示（NOTICE）・"
    echo "本体に取り込んだ第三者のコードの表示（THIRD_PARTY_NOTICES.md）があります。"
    echo "ここには、いっしょに同梱しているソフトウェアのライセンスの全文を置いています。"
    echo "ALL.txt は、これらをすべて 1 つにつないだ物です。"
    echo
    for f in "$lic"/*; do
      name="$(basename "$f")"
      case "$name" in README.txt | ALL.txt) continue ;; esac
      echo "- ${name}: $(license_description "$name")"
    done
    if [ $# -gt 0 ]; then
      echo
      echo "版:"
      for f in "$@"; do echo "- ${f}"; done
    fi
    echo
    echo "本体（npm の tarball）が初回の準備で取り込む依存（npm の registry から取る物）のライセンスは、"
    echo "入った先の node_modules の各パッケージにあります。"
  } > "$lic/README.txt"
  # 書きかけの物を licenses/ の中に置かない（下の * に拾われて、自分を読みながら書き足してしまう）
  local tmp="$dir/.ALL.txt.tmp"
  {
    for f in "$dir/NOTICE" "$dir/LICENSE" "$dir/THIRD_PARTY_NOTICES.md" "$lic/README.txt"; do
      printf '\n==================== %s ====================\n\n' "${f#"$dir"/}"
      cat "$f"
    done
    for f in "$lic"/*; do
      case "$(basename "$f")" in README.txt | ALL.txt) continue ;; esac
      printf '\n==================== %s ====================\n\n' "${f#"$dir"/}"
      cat "$f"
    done
  } > "$tmp"
  mv "$tmp" "$lic/ALL.txt"
}

# 同梱物の権限をそろえる（本人は読み書き、ほかの利用者は読める・動かせるが書けない）。cp は元の権限を引き継ぐので
# umask だけでは足りない（umask 077 で取り出した作業ツリーから写すと 600・700 のまま）
normalize_modes() {
  chmod -R u+rwX,go+rX,go-w "$@"
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
  # 大きさはバイトで（du -h は使っている領域なので、Setup.exe の 169,574,111 B が「177M」と出て報告と食い違った）
  echo "==> $f  $(wc -c < "$f" | tr -d ' ') B  sha256=$sum"
}
