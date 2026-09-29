# nf-overlay（Mac）

NF 右下の丸の本体。説明は [docs/overlay-macos.md](../../docs/overlay-macos.md)、約束は
[docs/overlay-protocol.md](../../docs/overlay-protocol.md)、配布・署名・公証は
[docs/overlay-macos-release.md](../../docs/overlay-macos-release.md)。

```
swift build && scripts/test.sh && scripts/package-app.sh
```

apps/macos（上流の OpenClaw.app）とは別の小さな SwiftPM にしている（swift-tools-version 6.3・Xcode 前提で、
Command Line Tools の Swift 6.2 では作れないため）。
