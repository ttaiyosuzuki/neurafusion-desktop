using System;
using System.IO;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using NfOverlay.Core;

namespace NfOverlay.Win;

/// <summary>
/// 丸を押すと開く小さな窓（DK-04）。中身は Web の7区画の画面（URL は Node の設定）を WebView2 で表示する。
/// URL が無い・読み込めないときは「未接続」を出す（本番のデータがあるようには見せない）。
/// 読んだ文字は、設定の URL と同じ出どころのページにだけ postMessage で渡す。
/// </summary>
internal sealed class PanelForm : Form
{
    public const int WidthDip = 380;
    public const int HeightDip = 560;

    private readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    private readonly string _userDataDir;
    private string? _panelUrl;
    private Task? _init;
    private bool _unconnected;

    public PanelForm(string userDataDir)
    {
        _userDataDir = userDataDir;
        Text = "NeuraFusion";
        FormBorderStyle = FormBorderStyle.SizableToolWindow;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        TopMost = true;
        Controls.Add(_web);
    }

    /// <summary>開いた（true）・閉じた（false）。Node へ panel の行を出すのに使う。</summary>
    public event Action<bool>? OpenChanged;

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        OpenChanged?.Invoke(Visible);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        // 閉じるボタンでは隠すだけ（次に押したとき速く開く）。
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
            return;
        }
        base.OnFormClosing(e);
    }

    public PanelMode Mode { get; private set; } = PanelMode.Disconnected;

    public void Configure(PanelMode mode, string? panelUrl)
    {
        var url = mode == PanelMode.Url ? panelUrl : null;
        Mode = url is null ? PanelMode.Disconnected : PanelMode.Url;
        if (_panelUrl == url && _web.CoreWebView2 is not null) return;
        _panelUrl = url;
        if (_web.CoreWebView2 is not null) Navigate();
    }

    /// <summary>丸の近く（左上側）に開く。画面からはみ出さないようにする。</summary>
    public async Task OpenNear(Rect bubble, Rect workArea, double scale)
    {
        var w = (int)Math.Round(WidthDip * scale);
        var h = (int)Math.Round(HeightDip * scale);
        var x = Math.Clamp(bubble.Right - w, workArea.X, Math.Max(workArea.X, workArea.Right - w));
        var y = bubble.Y - h - (int)Math.Round(8 * scale);
        if (y < workArea.Y) y = Math.Clamp(bubble.Bottom + (int)Math.Round(8 * scale), workArea.Y, Math.Max(workArea.Y, workArea.Bottom - h));
        Bounds = new System.Drawing.Rectangle(x, y, w, h);
        if (!Visible) Show();
        Activate();
        await EnsureReady();
        Post(new { type = "nf-overlay-status", state = "reading" });
    }

    /// <summary>読み取りの結果（文字数と方法だけ）をパネルに知らせる。</summary>
    public void Status(ReadOutcome outcome) =>
        Post(new { type = "nf-overlay-status", state = outcome.Ok ? "read" : "unreadable", app = outcome.App,
            method = outcome.Method, chars = outcome.Text?.Length ?? 0, reason = outcome.Reason });

    /// <summary>Node が PII を除いて返した本文（panel-text）。未接続の表示のときは渡さない。</summary>
    public void ShowText(string text) => Post(new { type = "nf-overlay-text", text });

    private Task EnsureReady() => _init ??= InitAsync();

    private async Task InitAsync()
    {
        Directory.CreateDirectory(_userDataDir);
        var env = await CoreWebView2Environment.CreateAsync(null, _userDataDir);
        await _web.EnsureCoreWebView2Async(env);
        var core = _web.CoreWebView2;
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.NavigationStarting += (_, e) =>
        {
            // 設定の URL と同じ出どころ以外へは移らない（未接続の表示は NavigateToString で about:blank 扱い）。
            if (!_unconnected && !SameOrigin(e.Uri)) e.Cancel = true;
        };
        core.NewWindowRequested += (_, e) => e.Handled = true;
        core.NavigationCompleted += (_, e) =>
        {
            if (!e.IsSuccess && !_unconnected) ShowUnconnected("パネルの画面を読み込めませんでした");
        };
        Navigate();
    }

    private void Navigate()
    {
        if (_panelUrl is null) { ShowUnconnected("パネルの URL が設定されていません"); return; }
        _unconnected = false;
        _web.CoreWebView2.Navigate(_panelUrl);
    }

    private void ShowUnconnected(string why)
    {
        _unconnected = true;
        _web.CoreWebView2?.NavigateToString(UnconnectedHtml(why));
    }

    private void Post(object message)
    {
        var core = _web.CoreWebView2;
        if (core is null || _unconnected || !SameOrigin(core.Source)) return;
        core.PostWebMessageAsJson(JsonSerializer.Serialize(message));
    }

    private bool SameOrigin(string? uri)
    {
        if (_panelUrl is null || uri is null) return false;
        return Uri.TryCreate(uri, UriKind.Absolute, out var a) && Uri.TryCreate(_panelUrl, UriKind.Absolute, out var b)
            && Uri.Compare(a, b, UriComponents.SchemeAndServer, UriFormat.Unescaped, StringComparison.OrdinalIgnoreCase) == 0;
    }

    private static string UnconnectedHtml(string why) =>
        "<!doctype html><meta charset=utf-8><title>NeuraFusion</title>" +
        "<style>body{font:14px system-ui,sans-serif;margin:24px;color:#1f2328}" +
        "@media(prefers-color-scheme:dark){body{background:#1b1e23;color:#ecedee}}" +
        "h1{font-size:16px}p{color:#5b6470}</style>" +
        "<h1>未接続</h1><p>7区画のパネルはまだ接続されていません。</p><p>" +
        System.Net.WebUtility.HtmlEncode(why) + "</p>";
}
