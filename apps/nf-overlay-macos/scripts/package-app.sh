#!/bin/sh
# NF 右下の丸（Mac）を NFOverlay.app にまとめて署名する（DK-06）。
#
#   scripts/package-app.sh              # アドホック署名（開発・手元の確認用。配布には使えない）
#   NF_SIGN_IDENTITY="Developer ID Application: <名前> (<TEAMID>)" scripts/package-app.sh
#                                       # Developer ID 署名（Apple Developer Program の登録後。本人のキーチェーンにある証明書の「名前」だけを渡す）
#   NF_NOTARY_PROFILE=<プロファイル名> scripts/package-app.sh
#                                       # 署名のあと公証（xcrun notarytool store-credentials で本人が作ったプロファイル名だけを渡す）
#
# 証明書・鍵・パスワードの値はこのスクリプトに書かない・引数に渡さない（キーチェーンとプロファイル名だけ）。
set -eu
cd "$(dirname "$0")/.."

VERSION="${NF_OVERLAY_VERSION:-0.1.0}"
APP="NFOverlay.app"
BUNDLE_ID="ai.neurafusion.overlay"

swift build -c release
BIN="$(swift build -c release --show-bin-path)/nf-overlay"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/nf-overlay"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleName</key><string>NF Overlay</string>
  <key>CFBundleDisplayName</key><string>NeuraFusion 右下の丸</string>
  <key>CFBundleExecutable</key><string>nf-overlay</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHumanReadableCopyright</key><string>NeuraFusion</string>
</dict>
</plist>
PLIST

if [ -n "${NF_SIGN_IDENTITY:-}" ]; then
  # Hardened Runtime つき（公証の条件）
  codesign --force --timestamp --options runtime --sign "$NF_SIGN_IDENTITY" "$APP"
else
  codesign --force --sign - "$APP"
  echo "アドホック署名です（配布不可。Developer ID の登録待ち）" >&2
fi
codesign --verify --strict --verbose=1 "$APP"

if [ -n "${NF_NOTARY_PROFILE:-}" ]; then
  if [ -z "${NF_SIGN_IDENTITY:-}" ]; then
    echo "公証には Developer ID 署名が要ります（NF_SIGN_IDENTITY）" >&2
    exit 2
  fi
  ditto -c -k --keepParent "$APP" NFOverlay.zip
  xcrun notarytool submit NFOverlay.zip --keychain-profile "$NF_NOTARY_PROFILE" --wait
  xcrun stapler staple "$APP"
  rm -f NFOverlay.zip
fi
echo "OK: $APP"
