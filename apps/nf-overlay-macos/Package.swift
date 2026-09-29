// swift-tools-version: 6.0
// NF 右下の丸（Mac）— AI アプリのウィンドウの右下に重ねる小さな丸（DK-01/02/04）。
// apps/macos（上流の OpenClaw.app）は swift-tools-version 6.3 と Xcode 前提のため、
// Command Line Tools（Swift 6.2）でも作れる独立した小さな実行ファイルにしている（README 参照）。

import PackageDescription

let package = Package(
    name: "NFOverlay",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "nf-overlay", targets: ["NFOverlay"]),
        .library(name: "NFOverlayCore", targets: ["NFOverlayCore"]),
    ],
    targets: [
        // 純粋な関数だけ（AppKit・AX に触れない）。位置の計算・対応アプリの判定・読み取りの段取り・記録。
        .target(name: "NFOverlayCore"),
        // AppKit・AX・ScreenCaptureKit・Vision・WebKit を使う本体。
        .executableTarget(
            name: "NFOverlay",
            dependencies: ["NFOverlayCore"],
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("ApplicationServices"),
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("Vision"),
                .linkedFramework("WebKit"),
            ]),
        .testTarget(name: "NFOverlayCoreTests", dependencies: ["NFOverlayCore"]),
    ],
    swiftLanguageModes: [.v5])
