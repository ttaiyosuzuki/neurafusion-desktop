// 丸を押したときの小窓（DK-04）。中身は既存の Web の画面（URL は設定で渡す）。
// 7区画を描く Web の部品と本番の API はまだ無いので、URL が無いときは「未接続」だけを出す。

import AppKit
import NFOverlayCore
import WebKit

final class PanelWindow: NSPanel, WKNavigationDelegate {
    private let web: WKWebView
    private(set) var mode: PanelMode = .disconnected
    private var loadedUrl: String?

    init() {
        let conf = WKWebViewConfiguration()
        conf.websiteDataStore = .nonPersistent() // 他のアプリ・ブラウザの情報と混ぜない
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: 380, height: 560), configuration: conf)
        super.init(contentRect: NSRect(x: 0, y: 0, width: 380, height: 560),
                   styleMask: [.titled, .closable, .resizable, .utilityWindow, .nonactivatingPanel],
                   backing: .buffered, defer: true)
        title = "NF 検品"
        level = .floating
        isFloatingPanel = true
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        contentView = web
        web.navigationDelegate = self
    }

    override var canBecomeKey: Bool { true }

    /// 開いてよい URL: 手元（127.0.0.1・localhost）の http か、https だけ。
    static func allowed(_ s: String?) -> URL? {
        guard let s, let u = URL(string: s), let scheme = u.scheme?.lowercased() else { return nil }
        if scheme == "https" { return u }
        if scheme == "http", let h = u.host, h == "127.0.0.1" || h == "localhost" { return u }
        return nil
    }

    func configure(mode: PanelMode, url: String?) {
        if mode == .url, let u = Self.allowed(url) {
            self.mode = .url
            if loadedUrl != u.absoluteString {
                loadedUrl = u.absoluteString
                web.load(URLRequest(url: u))
            }
        } else {
            self.mode = .disconnected
            loadedUrl = nil
            web.loadHTMLString(Self.disconnectedHtml(detail: nil), baseURL: nil)
        }
    }

    func show(at frame: Rect) {
        let c = toCocoa(frame, primaryHeight: WindowTracker.primaryHeight)
        setFrame(NSRect(x: c.x, y: c.y, width: c.w, height: c.h), display: true)
        orderFrontRegardless()
        makeKey()
    }

    /// Node で個人情報を伏せた本文を渡す。Web 側は `nf-overlay-text` の出来事で受け取る。
    /// 未接続のときは本文を出さず、文字数だけ示す。
    func deliver(text: String) {
        if mode == .url {
            guard let data = try? JSONSerialization.data(withJSONObject: ["text": text]),
                  let json = String(data: data, encoding: .utf8) else { return }
            web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('nf-overlay-text',{detail:\(json)}));")
        } else {
            web.loadHTMLString(Self.disconnectedHtml(detail: "読み取った文字: \(text.count) 文字（未接続のため、どこにも送っていません）"), baseURL: nil)
        }
    }

    func showStatus(_ s: String) {
        if mode == .disconnected { web.loadHTMLString(Self.disconnectedHtml(detail: s), baseURL: nil) }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fallBack() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fallBack() }

    private func fallBack() {
        mode = .disconnected
        loadedUrl = nil
        web.loadHTMLString(Self.disconnectedHtml(detail: "パネルの画面に接続できませんでした。"), baseURL: nil)
    }

    static func disconnectedHtml(detail: String?) -> String {
        let esc = (detail ?? "").replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
        return """
        <!doctype html><html lang="ja"><meta charset="utf-8">
        <style>
        :root{color-scheme:light dark;--fg:#1f2328;--muted:#5b6470;--bd:#d8dde3}
        @media (prefers-color-scheme:dark){:root{--fg:#ecedee;--muted:#a3acb5;--bd:#3a4048}}
        body{font:13px -apple-system,system-ui,sans-serif;color:var(--fg);margin:0;padding:20px}
        h1{font-size:15px;margin:0 0 8px}.m{color:var(--muted);line-height:1.6}
        .b{border:1px dashed var(--bd);border-radius:10px;padding:12px;margin-top:14px}
        </style>
        <h1>未接続</h1>
        <p class="m">検品パネルの画面にまだつながっていません。結果は表示されません。</p>
        \(esc.isEmpty ? "" : "<div class=\"b\">\(esc)</div>")
        </html>
        """
    }
}
