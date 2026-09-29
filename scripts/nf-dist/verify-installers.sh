#!/usr/bin/env bash
# NeuraFusion Desktop 配布形式（DK-09・TS-38）— 書き出した物の中身を確かめる。
#
#   bash scripts/nf-dist/verify-installers.sh [dmg] [exe] [deb] [appimage]   # 既定はこの OS で確かめられる物すべて
#   NF_DIST_SMOKE=1 …   # さらに、同梱の Node で本体を実際に入れて --version・--help を動かす（インターネットが要る・数分）
#
# .dmg は Mac、.deb・AppImage は Linux で確かめる。Windows のインストーラは実行できないので、形・同梱物・文言だけ。
# 見る物: 形と同梱物／本体の tarball に @openclaw/ai が入っているか／ライセンス文書が入っているか／利用者に見える所
#         （名前・文言・アイコン・--help・--version）に上流の名前やロブスターが無いか（docs/desktop-installers-licenses.md）。
#
# 呼んだ人のロケールに左右されない: この検査自身は LC_ALL=C で動く（macOS の bash は UTF-8 のロケールだと
# 変数のすぐ後ろの全角文字の先頭バイトを変数名に含めて止まっていた。全角の前の変数は ${v} と書く）。smoke で動かす本体にだけ、呼んだ人のロケールを渡す。
# 途中で止まっても（予期しない失敗・Ctrl-C・kill）、この検査が開いたマウントと一時フォルダは必ず片付ける。
set -Eeuo pipefail
NF_CALLER_LC_ALL="${LC_ALL-}"
NF_CALLER_LANG="${LANG-}"
export LC_ALL=C
HERE="$(cd "$(dirname "$0")" && pwd)"
source "$HERE/common.sh"
ICONS="$ROOT_DIR/packaging/installer/icons"

OKS=0
NGS=0
ok() { OKS=$((OKS + 1)); echo "ok   $*"; }
ng() { NGS=$((NGS + 1)); echo "NG   $*"; }
has() { if [ -e "$1" ]; then ok "$2"; else ng "$2（無い: $1）"; fi; }
contains() { case "$1" in *"$2"*) return 0 ;; esac; return 1; }

# ---- 片付け。この検査が開いたマウントと作った一時フォルダだけを覚えておき、終わるとき・止まるときに外して消す
MOUNTS=()
TMPS=()
is_mounted() { [ -d "$1" ] && [ "$(stat -f %d "$1" 2>/dev/null)" != "$(stat -f %d "$1/.." 2>/dev/null)" ]; }
unmount() {
  if is_mounted "$1"; then
    hdiutil detach -quiet "$1" 2>/dev/null || hdiutil detach -quiet -force "$1" 2>/dev/null ||
      echo "!! マウントを外せません: $1" >&2
  fi
  rmdir "$1" 2>/dev/null || true
}
cleanup() {
  local m t
  for m in "${MOUNTS[@]+"${MOUNTS[@]}"}"; do unmount "$m"; done
  MOUNTS=()
  for t in "${TMPS[@]+"${TMPS[@]}"}"; do rm -rf "$t"; done
  TMPS=()
}
trap cleanup EXIT
trap 'echo "!! 予期しない失敗で止まります（${LINENO} 行目: ${BASH_COMMAND}）" >&2' ERR
trap 'cleanup; trap - INT; kill -INT $$' INT
trap 'cleanup; trap - TERM; kill -TERM $$' TERM
trap 'cleanup; trap - HUP; kill -HUP $$' HUP

# 一時フォルダを作って TMP_DIR に入れる（$(...) の中で呼ぶと覚えた物が消えるので、変数で返す）
make_tmp() {
  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nf-verify.XXXXXX")"
  TMPS+=("$TMP_DIR")
}

# ---- 名前・ロゴ（オーナー方針: 上流の名前・fork は画面に書かない。出てよいのはライセンス文書の中だけ）
# $1=説明 残り=ファイル。上流の名前・旧名・ロブスターの絵文字が無ければ ok（scripts/nf-dist/brand-scan.py）
# （$(...) の中の「|| exit $?」: 見つかったときの 1 を、ERR の trap の「予期しない失敗」にしない）
no_brand() {
  local label="$1" out
  shift
  if out="$(python3 "$HERE/brand-scan.py" "$@" 2>&1 || exit $?)"; then ok "$label"; else ng "${label}（${out%%$'\n'*}）"; fi
}
# $1=説明 $2=Setup.exe。NSIS の見出し（画面の文言・レジストリの値・ショートカット名）を展開して見る
no_brand_nsis() {
  local out
  if out="$(python3 "$HERE/brand-scan.py" --nsis "$2" 2>&1 || exit $?)"; then ok "$1"; else ng "$1（${out%%$'\n'*}）"; fi
}
# $1=説明 $2=ファイル。CLI の --help 用: 機能上の名前・上流の外部サービス（理由つきの許可リスト brand-allow-help.json）を
# 除いて見る。ok のときは許可した件数も出す
no_brand_allowed() {
  local out
  if out="$(python3 "$HERE/brand-scan.py" --allow "$HERE/brand-allow-help.json" "$2" 2>&1 || exit $?)"; then
    ok "$1（${out%%$'\n'*}）"
  else
    ng "$1（${out%%$'\n'*}）"
  fi
}
# $1=説明 残り=フォルダ（直下だけ）。画像がどれも packaging/installer/icons の物と同じなら ok
images_are_ours() {
  local label="$1" d f i same bad="" n=0
  shift
  for d in "$@"; do
    [ -d "$d" ] || continue
    for f in "$d"/*; do
      case "$f" in *.icns | *.ico | *.png | *.svg | *.jpg | *.jpeg | *.gif | *.tif | *.tiff | *.bmp | *.webp) ;; *) continue ;; esac
      n=$((n + 1))
      same=""
      for i in "$ICONS"/*; do if cmp -s "$f" "$i"; then same=1; break; fi; done
      [ -n "$same" ] || bad="${bad} ${f##*/}"
    done
  done
  if [ -z "$bad" ] && [ "$n" -gt 0 ]; then ok "${label}（${n} 個）"; else ng "${label}（ほかの画像:${bad:- 1 つも無い}）"; fi
}

# $1=本体の tarball $2=名前。管理画面（Control UI）の題名・アプリの名前・アイコンが NeuraFusion の物か
# （アイコンは packaging/installer/icons の物とバイト単位で同じ。ui/public の物はそこから作った写し）
control_ui_is_ours() {
  local tgz="$1" name="$2" t ui=package/dist/control-ui
  make_tmp
  t="$TMP_DIR"
  if ! tar -xzf "$tgz" -C "$t" "$ui/index.html" "$ui/manifest.webmanifest" "$ui/favicon.svg" "$ui/favicon.ico" \
    "$ui/favicon-32.png" "$ui/apple-touch-icon.png" 2> /dev/null; then
    ng "$name: 管理画面の題名とアイコンを本体の tarball から出せない（${ui}）"
    return 0
  fi
  grep -o '<title>[^<]*</title>' "$t/$ui/index.html" > "$t/ui-title.txt" || true
  if grep -q -x -F '<title>NeuraFusion Control</title>' "$t/ui-title.txt"; then
    no_brand "$name: 管理画面の題名（NeuraFusion Control）・アプリの名前（manifest）" "$t/ui-title.txt" "$t/$ui/manifest.webmanifest"
  else
    ng "$name: 管理画面の題名が NeuraFusion Control でない（$(head -1 "$t/ui-title.txt")）"
  fi
  images_are_ours "$name: 管理画面のアイコン（favicon・apple-touch-icon）はどれも NeuraFusion の物" "$t/$ui"
}

# $1=フォルダ $2=名前。中身をほかの利用者も読める・動かせるか（組み立てた人の umask が 077 だと、写した先で本人しか開けない）
check_modes() {
  local bad
  bad="$(find "$1" ! -type l \( ! -perm -o+r -o \( -type d ! -perm -o+x \) -o \( -type f -perm -u+x ! -perm -o+x \) \) -print 2>/dev/null | head -3 || true)"
  if [ -z "$bad" ]; then ok "$2: 中身はほかの利用者も読める・動かせる（権限）"; else ng "$2: 本人しか読めない物がある（${bad##*/} ほか）"; fi
}

# ---- ライセンス文書（stage_licenses・finish_licenses が置く物）
# $1=置き場（LICENSE・NOTICE・THIRD_PARTY_NOTICES.md・licenses/ のある所） $2=名前 残り=licenses/ に要る部品のファイル
check_licenses() {
  local dir="$1" name="$2" f missing=""
  shift 2
  if cmp -s "$dir/LICENSE" "$ROOT_DIR/LICENSE" &&
    grep -q -F 'Copyright (c) 2026 OpenClaw Foundation' "$dir/LICENSE" &&
    grep -q -F 'Permission is hereby granted, free of charge' "$dir/LICENSE" &&
    grep -q -F 'Third-party notices for incorporated or adapted code are recorded in' "$dir/LICENSE"; then
    ok "$name: 上流の LICENSE 全文（著作権表示・許諾文・末尾の1行）"
  else
    ng "$name: 上流の LICENSE 全文が無い・違う（$dir/LICENSE）"
  fi
  if cmp -s "$dir/NOTICE" "$ROOT_DIR/NOTICE" && cmp -s "$dir/THIRD_PARTY_NOTICES.md" "$ROOT_DIR/THIRD_PARTY_NOTICES.md"; then
    ok "$name: NOTICE（由来と上流の著作権表示）・THIRD_PARTY_NOTICES.md"
  else
    ng "$name: NOTICE・THIRD_PARTY_NOTICES.md が無い・違う"
  fi
  for f in README.txt ALL.txt node-LICENSE.txt "$@"; do
    [ -s "$dir/licenses/$f" ] || missing="$missing $f"
  done
  if [ -z "$missing" ] && cmp -s "$dir/licenses/node-LICENSE.txt" "$dir/node/LICENSE" &&
    grep -q -F 'Node.js is licensed for use as follows' "$dir/licenses/node-LICENSE.txt" &&
    grep -q -F 'Copyright (c) 2026 OpenClaw Foundation' "$dir/licenses/ALL.txt" &&
    grep -q -F 'Permission is hereby granted, free of charge' "$dir/licenses/ALL.txt"; then
    ok "$name: 同梱した部品のライセンス全文（licenses/ の $(($# + 1)) 部品と一覧・全部をつないだ ALL.txt）"
  else
    ng "$name: 部品のライセンスが足りない・違う（licenses/:${missing:- 中身が違う}）"
  fi
}

# ---- 同梱の Node で本体を入れて --version・--help を動かす（NF_DIST_SMOKE=1 のときだけ）。$1=入口 $2=名前
# 本人の HOME・npm のキャッシュ・設定の置き場・通知に触れないよう、環境を空にし、使い捨ての HOME とデータの置き場で動かす。
smoke() {
  [ "${NF_DIST_SMOKE:-}" = 1 ] || return 0
  local entry="$1" name="$2" d v again
  make_tmp
  d="$TMP_DIR"
  mkdir -p "$d/home" "$d/shim"
  printf '#!/bin/sh\nexit 0\n' > "$d/shim/osascript" # Mac の通知を出さない
  chmod 755 "$d/shim/osascript"
  local envs=(HOME="$d/home" PATH="$d/shim:/usr/bin:/bin:/usr/sbin:/sbin" TMPDIR="${TMPDIR:-/tmp}"
    LC_ALL="$NF_CALLER_LC_ALL" LANG="$NF_CALLER_LANG" NF_DIST_DATA_DIR="$d/data" npm_config_update_notifier=false)
  if [ -n "${APPIMAGE_EXTRACT_AND_RUN:-}" ]; then envs+=(APPIMAGE_EXTRACT_AND_RUN=1); fi

  env -i "${envs[@]}" "$entry" --version > "$d/version.out" 2> "$d/version.err" || true
  v="$(tail -1 "$d/version.out")"
  if contains "$v" "$VERSION"; then
    ok "$name: 同梱の Node で本体を入れ、--version が動く（${v}）"
  else
    ng "$name: --version が動かない（$(tail -3 "$d/version.err" | tr '\n' ' ')）"
  fi
  tail -1 "$d/version.out" > "$d/version.line"
  no_brand "$name: --version に上流の名前が無い" "$d/version.line"
  env -i "${envs[@]}" "$entry" --version > /dev/null 2> "$d/again.err" || true
  again="$(grep -c '初回の準備' "$d/again.err" || true)"
  if [ "$again" = 0 ]; then ok "$name: 2回目は入れ直さない"; else ng "$name: 2回目も入れ直した"; fi
  env -i "${envs[@]}" "$entry" --help > "$d/help.out" 2> "$d/help.err" || true
  if [ -s "$d/help.out" ]; then
    no_brand_allowed "$name: --help に許可リスト以外の上流の名前が無い" "$d/help.out"
  else
    ng "$name: --help が何も出さない（$(tail -3 "$d/help.err" | tr '\n' ' ')）"
  fi
}

verify_one_dmg() {
  local dmg="$1" name mnt app res arch archs ft vol iconf t
  name="$(basename "$dmg")"
  if hdiutil verify -quiet "$dmg"; then ok "$name: hdiutil verify"; else ng "$name: hdiutil verify"; fi
  mnt="$(mktemp -d "${TMPDIR:-/tmp}/nf-verify-mnt.XXXXXX")"
  MOUNTS+=("$mnt")
  if ! hdiutil attach -quiet -nobrowse -readonly -noautoopen -mountpoint "$mnt" "$dmg"; then
    ng "$name: マウントできない"
    unmount "$mnt"
    return 0
  fi
  app="$mnt/NeuraFusion.app"
  res="$app/Contents/Resources"
  has "$app/Contents/MacOS/NeuraFusion" "$name: 入口"
  has "$res/node/bin/node" "$name: 同梱の Node"
  has "$res/node/lib/node_modules/npm/bin/npm-cli.js" "$name: 同梱の npm"
  has "$res/nf-launch.mjs" "$name: ランチャー"
  has "$res/NFOverlay.app/Contents/MacOS/nf-overlay" "$name: 丸の本体"
  has "$res/$PACKAGE_NAME-$VERSION.tgz" "$name: 本体の tarball"
  has "$mnt/アプリケーション" "$name: アプリケーションへの別名"
  arch="${name##*-}"
  arch="${arch%.dmg}"
  if [ "$arch" = x64 ]; then arch=x86_64; fi
  ft="$(file "$res/node/bin/node" 2>/dev/null || true)"
  if contains "$ft" "$arch"; then ok "$name: Node は $arch"; else ng "$name: Node のアーキテクチャ違い"; fi
  archs="$(lipo -archs "$res/NFOverlay.app/Contents/MacOS/nf-overlay" 2>/dev/null || true)"
  if contains " $archs " " $arch "; then ok "$name: 丸は $arch を含む"; else ng "$name: 丸に $arch が無い"; fi
  if codesign --verify --strict "$app" 2>/dev/null; then ok "$name: 署名の検証（アドホック）"; else ng "$name: 署名の検証"; fi
  if /usr/libexec/PlistBuddy -c "Print :NSAccessibilityUsageDescription" "$app/Contents/Info.plist" > /dev/null 2>&1; then
    ok "$name: アクセシビリティの理由"
  else
    ng "$name: アクセシビリティの理由が無い"
  fi
  if tgz_has_ai_runtime "$res/$PACKAGE_NAME-$VERSION.tgz"; then
    ok "$name: 本体の tarball に @openclaw/ai が入っている"
  else
    ng "$name: 本体の tarball に @openclaw/ai が入っていない（npm pack で作った物？）"
  fi
  control_ui_is_ours "$res/$PACKAGE_NAME-$VERSION.tgz" "$name"
  check_modes "$app" "$name"

  # ライセンス文書（.app の中と、開いた窓）
  check_licenses "$res" "$name"
  if [ -s "$mnt/ライセンス.txt" ] && cmp -s "$mnt/ライセンス.txt" "$res/licenses/ALL.txt"; then
    ok "$name: 開いた窓の「ライセンス.txt」（上流の MIT 全文・Node.js まで）"
  else
    ng "$name: 開いた窓に「ライセンス.txt」が無い・違う"
  fi

  # 名前とアイコン（開いた窓・Finder・許可の画面・「情報を見る」に出る物）
  make_tmp
  t="$TMP_DIR"
  vol="$(diskutil info "$mnt" | sed -n 's/^ *Volume Name: *//p')"
  # ls はフォルダを 1 つずつ（まとめて渡すと見出しに一時フォルダのパスが入り、そこに上流の名前が入りうる）
  { echo "$vol"; ls -1A "$mnt"; ls -1A "$app/Contents"; ls -1A "$res"; } > "$t/visible-names.txt"
  no_brand "$name: 窓と .app に見える名前（ボリューム名「${vol}」・ファイル名）" "$t/visible-names.txt"
  no_brand "$name: Info.plist（入口と丸の名前・許可の理由・著作権の欄）" "$app/Contents/Info.plist" "$res/NFOverlay.app/Contents/Info.plist"
  no_brand "$name: はじめにお読みください.txt・README-ja.txt" "$mnt/はじめにお読みください.txt" "$res/README-ja.txt"
  no_brand "$name: 入口と丸の本体の中の文字" "$app/Contents/MacOS/NeuraFusion" "$res/NFOverlay.app/Contents/MacOS/nf-overlay"
  iconf="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIconFile" "$app/Contents/Info.plist" 2>/dev/null || true)"
  if [ -n "$iconf" ] && cmp -s "$res/${iconf%.icns}.icns" "$ICONS/neurafusion.icns"; then
    ok "$name: アイコンは NeuraFusion の物（${iconf}）"
  else
    ng "$name: アイコンが NeuraFusion の物ではない（CFBundleIconFile=${iconf}）"
  fi
  images_are_ours "$name: 窓と .app の中の画像はどれも NeuraFusion の物" "$mnt" "$res" "$res/NFOverlay.app/Contents/Resources"

  if [ "$(uname -m)" = "$arch" ]; then smoke "$app/Contents/MacOS/NeuraFusion" "$name"; fi
  unmount "$mnt"
}

verify_dmg() {
  local dmg found=0
  for dmg in "$OUT_DIR"/NeuraFusion-Desktop-"$VERSION"-macos-*.dmg; do
    [ -f "$dmg" ] || continue
    found=1
    verify_one_dmg "$dmg"
  done
  if [ "$found" = 0 ]; then ng ".dmg が無い（${OUT_DIR}）"; fi
}

verify_exe() {
  local exe="$OUT_DIR/NeuraFusion-Desktop-$VERSION-windows-x64-Setup.exe" name z t x f
  if [ ! -f "$exe" ]; then
    ng "Windows のインストーラが無い"
    return 0
  fi
  name="$(basename "$exe")"
  if [ "$(head -c 2 "$exe")" = "MZ" ]; then ok "$name: PE（MZ）"; else ng "$name: PE ではない"; fi
  if grep -a -q "Nullsoft" "$exe"; then ok "$name: NSIS のインストーラ"; else ng "$name: NSIS の印が無い"; fi
  make_tmp
  t="$TMP_DIR"
  no_brand_nsis "$name: インストーラの文言・「アプリと機能」の表示名と発行元・ショートカット名" "$exe"
  head -c 131072 "$exe" > "$t/stub.bin"
  no_brand "$name: インストーラの版情報（製品名・説明・著作権）" "$t/stub.bin"
  z="$(command -v 7zz || command -v 7z || true)"
  if [ -z "$z" ]; then
    echo "--   $name: 7z が無いので、同梱物・ライセンス文書・丸の本体は見ない（形と文言だけ）"
    return 0
  fi
  "$z" l -slt "$exe" 2>/dev/null | sed -n 's/^Path = //p' | tail -n +2 > "$t/paths.txt" || true
  for f in node/node.exe nf-launch.mjs nf-dist.json overlay/nf-overlay.exe "$PACKAGE_NAME-$VERSION.tgz"; do
    if grep -q -x -F -- "$f" "$t/paths.txt"; then ok "$name: 同梱 $f"; else ng "$name: $f が無い"; fi
  done
  no_brand "$name: 入れるファイルの名前" "$t/paths.txt"
  x="$t/x"
  "$z" x -y -o"$x" "$exe" > "$t/7z-x.log" 2>&1 || true
  if tgz_has_ai_runtime "$x/$PACKAGE_NAME-$VERSION.tgz"; then
    ok "$name: 本体の tarball に @openclaw/ai が入っている"
  else
    ng "$name: 本体の tarball に @openclaw/ai が入っていない（npm pack で作った物？）"
  fi
  control_ui_is_ours "$x/$PACKAGE_NAME-$VERSION.tgz" "$name"
  check_licenses "$x" "$name" nsis-COPYING.txt dotnet-runtime-LICENSE.txt dotnet-runtime-THIRD-PARTY-NOTICES.txt \
    dotnet-windowsdesktop-LICENSE.txt dotnet-library-license.txt webview2-LICENSE.txt webview2-NOTICE.txt
  no_brand "$name: 丸の本体（nf-overlay.exe の製品名・会社名・中の文字）・README-ja.txt" "$x/overlay/nf-overlay.exe" "$x/README-ja.txt"
  if cmp -s "$x/neurafusion.ico" "$ICONS/neurafusion.ico"; then
    ok "$name: アイコンは NeuraFusion の物（インストーラ・スタートメニュー・「アプリと機能」）"
  else
    ng "$name: アイコンが NeuraFusion の物ではない"
  fi
  images_are_ours "$name: 入れる画像はどれも NeuraFusion の物" "$x" "$x/licenses" "$x/overlay"
}

verify_deb() {
  local deb name t x opt cr
  deb="$(ls -1 "$OUT_DIR"/neurafusion-desktop_*_amd64.deb 2>/dev/null | head -1 || true)"
  if [ -z "$deb" ]; then
    ng ".deb が無い"
    return 0
  fi
  name="$(basename "$deb")"
  make_tmp
  t="$TMP_DIR"
  if dpkg-deb --info "$deb" > "$t/deb-info.txt" 2>&1; then ok "$name: dpkg-deb --info"; else ng "$name: dpkg-deb --info"; fi
  if grep -q "Package: neurafusion-desktop" "$t/deb-info.txt"; then ok "$name: Package"; else ng "$name: Package"; fi
  if grep -q "Depends:.*python3-gi" "$t/deb-info.txt"; then ok "$name: Depends（丸の本体の OS パッケージ）"; else ng "$name: Depends"; fi
  dpkg-deb --contents "$deb" > "$t/deb-contents.txt" 2>&1 || true
  for f in ./usr/bin/neurafusion-desktop ./opt/neurafusion/node/bin/node ./opt/neurafusion/nf-launch.mjs ./opt/neurafusion/overlay/nf-overlay ./usr/share/applications/neurafusion-desktop.desktop; do
    if grep -q " $f\$" "$t/deb-contents.txt"; then ok "$name: $f"; else ng "$name: $f が無い"; fi
  done
  x="$t/x"
  mkdir -p "$x"
  dpkg-deb -x "$deb" "$x"
  opt="$x/opt/neurafusion"
  if tgz_has_ai_runtime "$opt/$PACKAGE_NAME-$VERSION.tgz"; then
    ok "$name: 本体の tarball に @openclaw/ai が入っている"
  else
    ng "$name: 本体の tarball に @openclaw/ai が入っていない（npm pack で作った物？）"
  fi
  control_ui_is_ours "$opt/$PACKAGE_NAME-$VERSION.tgz" "$name"
  check_modes "$x" "$name"
  check_licenses "$opt" "$name"
  cr="$x/usr/share/doc/neurafusion-desktop/copyright"
  if [ -s "$cr" ] && cmp -s "$cr" "$opt/licenses/ALL.txt"; then
    ok "$name: /usr/share/doc/neurafusion-desktop/copyright（上流の MIT 全文・Node.js まで）"
  else
    ng "$name: /usr/share/doc/neurafusion-desktop/copyright が無い・違う"
  fi
  no_brand "$name: パッケージの説明・デスクトップ項目・入口・README-ja.txt" "$t/deb-info.txt" \
    "$x/usr/share/applications/neurafusion-desktop.desktop" "$x/usr/bin/neurafusion-desktop" "$opt/README-ja.txt"
  if cmp -s "$x/usr/share/icons/hicolor/256x256/apps/neurafusion-desktop.png" "$ICONS/neurafusion-256.png"; then
    ok "$name: アイコンは NeuraFusion の物"
  else
    ng "$name: アイコンが NeuraFusion の物ではない"
  fi
  images_are_ours "$name: 入れる画像はどれも NeuraFusion の物" "$opt" "$x/usr/share/icons/hicolor/256x256/apps"
  if [ "${NF_DIST_SMOKE:-}" = 1 ]; then
    sed "s#/opt/neurafusion#$x/opt/neurafusion#g" "$x/usr/bin/neurafusion-desktop" > "$x/entry"
    chmod +x "$x/entry"
    smoke "$x/entry" "$name"
  fi
}

verify_appimage() {
  local img="$OUT_DIR/NeuraFusion-Desktop-$VERSION-x86_64.AppImage" name t sq ft
  if [ ! -f "$img" ]; then
    ng "AppImage が無い"
    return 0
  fi
  name="$(basename "$img")"
  ft="$(file "$img" 2>/dev/null || true)"
  if contains "$ft" "ELF 64-bit"; then ok "$name: ELF 64-bit"; else ng "$name: ELF ではない"; fi
  [ -x "$img" ] || chmod +x "$img"
  make_tmp
  t="$TMP_DIR"
  if (cd "$t" && "$img" --appimage-extract > /dev/null 2>&1); then ok "$name: 展開できる"; else ng "$name: 展開できない"; fi
  sq="$t/squashfs-root"
  has "$sq/AppRun" "$name: AppRun"
  has "$sq/opt/neurafusion/overlay/nf-overlay" "$name: 丸の本体"
  if tgz_has_ai_runtime "$sq/opt/neurafusion/$PACKAGE_NAME-$VERSION.tgz"; then
    ok "$name: 本体の tarball に @openclaw/ai が入っている"
  else
    ng "$name: 本体の tarball に @openclaw/ai が入っていない（npm pack で作った物？）"
  fi
  control_ui_is_ours "$sq/opt/neurafusion/$PACKAGE_NAME-$VERSION.tgz" "$name"
  check_modes "$sq" "$name"
  check_licenses "$sq/opt/neurafusion" "$name" appimage-type2-runtime-LICENSE.txt
  no_brand "$name: デスクトップ項目・AppRun・README-ja.txt" "$sq/neurafusion-desktop.desktop" "$sq/AppRun" "$sq/opt/neurafusion/README-ja.txt"
  if cmp -s "$sq/neurafusion-desktop.png" "$ICONS/neurafusion-256.png"; then
    ok "$name: アイコンは NeuraFusion の物"
  else
    ng "$name: アイコンが NeuraFusion の物ではない"
  fi
  images_are_ours "$name: 画像はどれも NeuraFusion の物" "$sq" "$sq/opt/neurafusion"
  APPIMAGE_EXTRACT_AND_RUN=1 smoke "$img" "$name"
}

KINDS=("$@")
if [ $# -eq 0 ]; then
  case "$(uname -s)" in Darwin) KINDS=(dmg exe) ;; Linux) KINDS=(deb appimage) ;; *) KINDS=(exe) ;; esac
fi
for k in "${KINDS[@]}"; do
  case "$k" in
    dmg) verify_dmg ;;
    exe) verify_exe ;;
    deb) verify_deb ;;
    appimage) verify_appimage ;;
    *) ng "知らない種類: $k" ;;
  esac
done
echo "ok ${OKS} / NG ${NGS}"
if [ "$NGS" -eq 0 ]; then
  echo "EXIT=0"
  exit 0
fi
echo "EXIT=1"
exit 1
