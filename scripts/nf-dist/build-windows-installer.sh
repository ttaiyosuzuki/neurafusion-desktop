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
NODE_VER="$(bash "$ROOT_DIR/scripts/nf-dist/fetch-node.sh" win-x64 "$STAGE/node" | awk '{print $2}')"
stage_licenses "$STAGE" windows

# 丸の本体（Mac でも EnableWindowsTargeting で書き出せる）。途中で止まった前回の中間物が残ると
# runtimeconfig.json が無いと言って落ちるので、先に同じ構成で掃除する
CSPROJ="$ROOT_DIR/apps/nf-overlay-windows/src/NfOverlay.Win/NfOverlay.Win.csproj"
"$DOTNET" clean "$CSPROJ" -c Release -r win-x64 -p:EnableWindowsTargeting=true >/dev/null 2>&1 || true
"$DOTNET" publish "$CSPROJ" \
  -c Release -r win-x64 --self-contained true \
  -p:EnableWindowsTargeting=true -p:PublishSingleFile=true \
  -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true \
  -o "$STAGE_ROOT/windows-overlay" >"$STAGE_ROOT/windows-overlay.log" 2>&1 \
  || { tail -20 "$STAGE_ROOT/windows-overlay.log" >&2; exit 1; }
mkdir -p "$STAGE/overlay"
cp "$STAGE_ROOT/windows-overlay/nf-overlay.exe" "$STAGE/overlay/"
write_manifest "$STAGE" "overlay/nf-overlay.exe"

# 丸の本体に入った .NET ランタイム（自己完結）と WebView2 のライセンス。書き出しに使った版の物を、
# 復元の記録（project.assets.json）から NuGet の置き場で探して写す（見つからなければ止まる）
ASSETS="$(dirname "$CSPROJ")/obj/project.assets.json"
PACKS="$(node -e '
  const fs = require("fs"), path = require("path");
  const a = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const want = [];
  for (const fw of Object.values(a.project?.frameworks ?? {}))
    for (const d of fw.downloadDependencies ?? [])
      if (/^Microsoft\.(NETCore|WindowsDesktop)\.App\.Runtime\.win-x64$/i.test(d.name))
        want.push([d.name, String(d.version).replace(/[\[\]\s]/g, "").split(",")[0]]);
  for (const key of Object.keys(a.libraries ?? {})) {
    const [name, version] = key.split("/");
    if (name.toLowerCase() === "microsoft.web.webview2") want.push([name, version]);
  }
  for (const [name, version] of want) {
    const dir = Object.keys(a.packageFolders ?? {}).map((r) => path.join(r, name.toLowerCase(), version)).find((d) => fs.existsSync(d));
    if (!dir) throw new Error(`NuGet の置き場に無い: ${name} ${version}`);
    console.log([name, version, dir].join("\t"));
  }
' "$ASSETS")"
LICENSE_VERSIONS=("Node.js ${NODE_VER}（win-x64）")
while IFS=$'\t' read -r PKG VER DIR; do
  [ -n "$PKG" ] || continue
  case "$PKG" in
    Microsoft.NETCore.App.Runtime.win-x64)
      cp "$DIR/LICENSE.TXT" "$STAGE/licenses/dotnet-runtime-LICENSE.txt"
      cp "$DIR/THIRD-PARTY-NOTICES.TXT" "$STAGE/licenses/dotnet-runtime-THIRD-PARTY-NOTICES.txt" ;;
    Microsoft.WindowsDesktop.App.Runtime.win-x64)
      cp "$DIR/LICENSE" "$STAGE/licenses/dotnet-windowsdesktop-LICENSE.txt" ;;
    Microsoft.Web.WebView2)
      cp "$DIR/LICENSE.txt" "$STAGE/licenses/webview2-LICENSE.txt"
      cp "$DIR/NOTICE.txt" "$STAGE/licenses/webview2-NOTICE.txt" ;;
  esac
  LICENSE_VERSIONS+=("$PKG $VER")
done <<< "$PACKS"
LICENSE_VERSIONS+=("$("$MAKENSIS" -VERSION | sed 's/^v/NSIS /')")
finish_licenses "$STAGE" "${LICENSE_VERSIONS[@]}"

OUT="$OUT_DIR/NeuraFusion-Desktop-$VERSION-windows-x64-Setup.exe"
rm -f "$OUT"
# makensis（POSIX 版）はロケールが無いと日本語の行で落ちる
LC_ALL=en_US.UTF-8 "$MAKENSIS" -V2 -INPUTCHARSET UTF8 \
  "-DSTAGE=$STAGE" "-DOUTFILE=$OUT" "-DVERSION=$VERSION" \
  "$ROOT_DIR/packaging/installer/windows/neurafusion.nsi"
record_artifact "$OUT"
