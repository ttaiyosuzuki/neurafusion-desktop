#!/bin/sh
# Command Line Tools だけの Mac で swift test を流す（XCTest が無く、Swift Testing の
# _Testing_Foundation の x86_64 モジュールが入っていないため、フレームワークの場所を渡し cross-import を切る）。
set -e
cd "$(dirname "$0")/.."
F=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
if [ -d "$F/Testing.framework" ] && ! xcode-select -p 2>/dev/null | grep -q Xcode.app; then
  exec swift test -Xswiftc -F -Xswiftc "$F" -Xswiftc -Xfrontend -Xswiftc -disable-cross-import-overlays \
    -Xlinker -F -Xlinker "$F" -Xlinker -rpath -Xlinker "$F" "$@"
fi
exec swift test "$@"
