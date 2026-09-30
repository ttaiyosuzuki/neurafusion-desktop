using System.Text;
using System.Text.Json;

namespace NfOverlay.Core;

/// <summary>押したときの読み方（アプリごと）。Mac の "ax-…" と同じ値を受け、"uia-…" も同じ意味で受ける。</summary>
public enum ReadMode { UiaThenOcr, UiaOnly, Off }

/// <summary>パネルの出し方。disconnected は「未接続」の表示だけ（本番のデータがあるように見せない）。</summary>
public enum PanelMode { Url, Disconnected }

/// <summary>対応アプリ1件。実行ファイル名は Node（レジストリ）から受け取る。ここに既定値は持たない。</summary>
public sealed record OverlayApp(string Id, string Label, IReadOnlyList<string> Exe, bool Enabled,
    ReadMode Read = ReadMode.UiaThenOcr);

/// <summary>Node から受け取る設定（{"v":1,"type":"config",...}。docs/overlay-protocol.md）。</summary>
public sealed record OverlayConfig(
    bool Enabled,
    IReadOnlyList<OverlayApp> Apps,
    string? PanelUrl,
    int BubbleSize = 44,
    int Margin = 16,
    PanelMode PanelMode = PanelMode.Disconnected,
    bool OcrAskEachTime = true,
    int MinChars = 1)
{
    public static readonly OverlayConfig Off = new(false, Array.Empty<OverlayApp>(), null);
}

/// <summary>Node から来る1行の種類。</summary>
public abstract partial record InboundMessage
{
    public sealed record Config(OverlayConfig Value) : InboundMessage;
    public sealed record Stop : InboundMessage;
    /// <summary>Node が PII を除いた本文。パネルにだけ渡す。</summary>
    public sealed record PanelText(string Text) : InboundMessage;
    public sealed record GetReadLog : InboundMessage;
    /// <summary>知らない type。前方互換のため黙って読み飛ばす。</summary>
    public sealed record Unknown(string Type) : InboundMessage;
    /// <summary>JSON として読めない行。error を返して読み続ける。</summary>
    public sealed record Malformed(string Reason) : InboundMessage;
}

/// <summary>read の失敗の理由（Mac の "ax-…" に対応する Windows 分は "uia-…"）。</summary>
public static class ReadReason
{
    public const string UiaEmpty = "uia-empty";
    public const string UiaError = "uia-error";
    public const string OcrEmpty = "ocr-empty";
    public const string OcrError = "ocr-error";
    public const string ConsentDeclined = "consent-declined";
    public const string ReadOff = "read-off";
}

/// <summary>
/// 標準入出力の JSON 1行ずつの約束。dk-mac の docs/overlay-protocol.md と同じ形（差は README「Mac 版との差」）。
/// 読んだ文字（text）を載せるのは、読めたときの read 1行だけ。Node はこれをログに書かず、PII を除いてパネルへ返す。
/// </summary>
public static partial class Protocol
{
    public const int Version = 1;
    private const int MaxLineBytes = 1024 * 1024;

    public static InboundMessage Parse(string? line)
    {
        if (string.IsNullOrWhiteSpace(line)) return new InboundMessage.Malformed("empty");
        if (Encoding.UTF8.GetByteCount(line) > MaxLineBytes) return new InboundMessage.Malformed("too-long");
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return new InboundMessage.Malformed("not-object");
            var type = Str(root, "type");
            return type switch
            {
                "config" => ParseConfig(root),
                "stop" => new InboundMessage.Stop(),
                "panel-text" => Str(root, "text") is { } t
                    ? new InboundMessage.PanelText(t) : new InboundMessage.Malformed("no-text"),
                "getReadLog" or "get-read-log" => new InboundMessage.GetReadLog(),
                // FF 先読み（FfProtocol.cs）
                "ff-config" => ParseFfConfig(root),
                "ff-line" => ParseFfLine(root),
                "ff-hide" => new InboundMessage.FfHide(),
                null => new InboundMessage.Malformed("no-type"),
                _ => new InboundMessage.Unknown(type),
            };
        }
        catch (JsonException)
        {
            return new InboundMessage.Malformed("bad-json");
        }
    }

    private static InboundMessage ParseConfig(JsonElement root)
    {
        var apps = new List<OverlayApp>();
        if (root.TryGetProperty("apps", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var a in arr.EnumerateArray())
            {
                if (a.ValueKind != JsonValueKind.Object) continue;
                var id = Str(a, "id");
                if (string.IsNullOrWhiteSpace(id)) continue;
                var exe = new List<string>();
                // Windows 分は "win": ["x.exe", ...]（約束の形）。"win": {"exe": [...]} も受ける。Mac の "mac" は見ない。
                if (a.TryGetProperty("win", out var win))
                {
                    if (win.ValueKind == JsonValueKind.Object) AddStrings(win, "exe", exe);
                    else AddStrings(a, "win", exe);
                }
                apps.Add(new OverlayApp(id, Str(a, "label") ?? id, exe, Bool(a, "enabled") ?? true,
                    ParseReadMode(Str(a, "read"))));
            }
        }

        var url = Str(root, "panelUrl");
        if (url is not null && !IsAllowedPanelUrl(url)) url = null;
        var mode = Str(root, "panelMode") == "url" && url is not null ? PanelMode.Url : PanelMode.Disconnected;

        return new InboundMessage.Config(new OverlayConfig(
            Enabled: Bool(root, "enabled") ?? true,
            Apps: apps,
            PanelUrl: url,
            BubbleSize: Math.Clamp(Int(root, "size") ?? 44, 24, 96),
            Margin: Math.Clamp(Int(root, "margin") ?? 16, 0, 64),
            PanelMode: mode,
            // 今の約束は "ask-each-time" だけ。知らない値でも、毎回聞く方に倒す。
            OcrAskEachTime: true,
            MinChars: Math.Clamp(Int(root, "minChars") ?? 1, 1, 10_000)));
    }

    private static ReadMode ParseReadMode(string? s) => s switch
    {
        "ax-only" or "uia-only" => ReadMode.UiaOnly,
        "off" => ReadMode.Off,
        _ => ReadMode.UiaThenOcr,
    };

    /// <summary>パネルに開いてよい URL。https か、手元の http://localhost・127.0.0.1 だけ。</summary>
    public static bool IsAllowedPanelUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        if (u.Scheme == Uri.UriSchemeHttps) return true;
        return u.Scheme == Uri.UriSchemeHttp && (u.Host == "localhost" || u.Host == "127.0.0.1");
    }

    // ---- 出す行（どれも "v":1 から始まる） ----

    /// <summary>Windows は UI Automation にも、ウィンドウの撮影にも OS の許可が要らないので、どちらも true。</summary>
    public static string Ready(string version, bool uia = true, bool screen = true) => Write("ready", w =>
    {
        w.WriteString("platform", "windows");
        w.WriteBoolean("uia", uia);
        w.WriteBoolean("screen", screen);
        w.WriteString("version", version);
    });

    /// <summary>座標は左上原点。window・dot は論理座標（物理ピクセル ÷ scale）、px に物理ピクセルも付ける。</summary>
    public static string Geometry(string app, Rect frame, Rect bubble, double scale) => Write("geometry", w =>
    {
        w.WriteString("app", app);
        WriteRect(w, "window", Logical(frame, scale));
        WriteRect(w, "dot", Logical(bubble, scale));
        w.WriteNumber("scale", Math.Round(scale, 3));
        w.WriteStartObject("px");
        WriteRect(w, "window", frame);
        WriteRect(w, "dot", bubble);
        w.WriteEndObject();
    });

    public static string Hidden(string reason, string? detail = null, string? app = null) => Write("hidden", w =>
    {
        w.WriteString("reason", reason);
        if (detail is not null) w.WriteString("detail", detail);
        if (app is not null) w.WriteString("app", app);
    });

    public static string Clicked(string app) => Write("clicked", w => w.WriteString("app", app));

    /// <summary>押した1回の結果。text は ok のときだけ載せる（Node はログに書かない）。</summary>
    public static string Read(string app, string method, bool ok, int chars, string? reason,
        string? text, IReadOnlyList<ReadAttempt>? attempts = null) => Write("read", w =>
    {
        w.WriteString("app", app);
        w.WriteString("method", method);
        w.WriteBoolean("ok", ok);
        w.WriteNumber("chars", chars);
        if (reason is not null) w.WriteString("reason", reason);
        if (attempts is { Count: > 0 })
        {
            w.WriteStartArray("attempts");
            foreach (var a in attempts)
            {
                w.WriteStartObject();
                w.WriteString("method", a.Method.Wire());
                w.WriteBoolean("ok", a.Ok);
                w.WriteNumber("chars", a.Chars);
                if (a.Reason is not null) w.WriteString("reason", a.Reason);
                w.WriteEndObject();
            }
            w.WriteEndArray();
        }
        if (ok && text is not null) w.WriteString("text", text);
    });

    public static string Panel(bool open, PanelMode mode) => Write("panel", w =>
    {
        w.WriteBoolean("open", open);
        w.WriteString("mode", mode == PanelMode.Url ? "url" : "disconnected");
    });

    public static string ReadLogLine(ReadLog log) => Write("read-log", w =>
    {
        w.WritePropertyName("apps");
        log.WriteJson(w);
    });

    public static string Error(string code, string message) => Write("error", w =>
    {
        w.WriteString("code", code);
        w.WriteString("message", message);
    });

    private static Rect Logical(Rect r, double scale)
    {
        if (scale <= 0 || Math.Abs(scale - 1.0) < 1e-9) return r;
        int L(int v) => (int)Math.Round(v / scale);
        return Rect.FromLtrb(L(r.X), L(r.Y), L(r.Right), L(r.Bottom));
    }

    private static void WriteRect(Utf8JsonWriter w, string name, Rect r)
    {
        w.WriteStartObject(name);
        w.WriteNumber("x", r.X);
        w.WriteNumber("y", r.Y);
        w.WriteNumber("w", r.W);
        w.WriteNumber("h", r.H);
        w.WriteEndObject();
    }

    private static string Write(string type, Action<Utf8JsonWriter> body)
    {
        using var ms = new MemoryStream();
        // 日本語をそのまま出す（\uXXXX にしない）。改行は JSON の中で必ずエスケープされるので1行に収まる。
        var opts = new JsonWriterOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        using (var w = new Utf8JsonWriter(ms, opts))
        {
            w.WriteStartObject();
            w.WriteNumber("v", Version);
            w.WriteString("type", type);
            body(w);
            w.WriteEndObject();
        }
        return Encoding.UTF8.GetString(ms.ToArray());
    }

    private static string? Str(JsonElement o, string name) =>
        o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static bool? Bool(JsonElement o, string name) =>
        o.TryGetProperty(name, out var v) && (v.ValueKind is JsonValueKind.True or JsonValueKind.False)
            ? v.GetBoolean() : null;

    private static int? Int(JsonElement o, string name) =>
        o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d)
            && d is >= int.MinValue and <= int.MaxValue ? (int)Math.Round(d) : null;

    private static void AddStrings(JsonElement o, string name, List<string> into)
    {
        if (!o.TryGetProperty(name, out var v)) return;
        if (v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())) into.Add(v.GetString()!);
        else if (v.ValueKind == JsonValueKind.Array)
            foreach (var e in v.EnumerateArray())
                if (e.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(e.GetString())) into.Add(e.GetString()!);
    }
}
