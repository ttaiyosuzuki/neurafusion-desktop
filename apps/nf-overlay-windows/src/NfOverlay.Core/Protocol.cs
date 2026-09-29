using System.Text;
using System.Text.Json;

namespace NfOverlay.Core;

/// <summary>対応アプリ1件。実行ファイル名は Node（レジストリ）から受け取る。ここに既定値は持たない。</summary>
public sealed record OverlayApp(string Id, string Label, IReadOnlyList<string> Exe, bool Enabled);

/// <summary>Node から受け取る設定（{"type":"config",...}）。</summary>
public sealed record OverlayConfig(
    bool Enabled,
    IReadOnlyList<OverlayApp> Apps,
    string? PanelUrl,
    int BubbleSize = 44,
    int Margin = 16,
    bool Ocr = true,
    int MinChars = 1)
{
    public static readonly OverlayConfig Off = new(false, Array.Empty<OverlayApp>(), null);
}

/// <summary>Node から来る1行の種類。</summary>
public abstract record InboundMessage
{
    public sealed record Config(OverlayConfig Value) : InboundMessage;
    public sealed record Stop : InboundMessage;
    public sealed record GetReadLog : InboundMessage;
    /// <summary>読めない行・知らない type。error を返して読み続ける。</summary>
    public sealed record Invalid(string Reason) : InboundMessage;
}

/// <summary>
/// 標準入出力の JSON 1行ずつの約束。docs/overlay-windows.md と同じ形。
/// 読んだ生の文字を載せる型はここには無い（出せるのは文字数だけ）。
/// </summary>
public static class Protocol
{
    public const int Version = 1;
    private const int MaxLineBytes = 256 * 1024;

    public static InboundMessage Parse(string? line)
    {
        if (string.IsNullOrWhiteSpace(line)) return new InboundMessage.Invalid("empty");
        if (Encoding.UTF8.GetByteCount(line) > MaxLineBytes) return new InboundMessage.Invalid("too_long");
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return new InboundMessage.Invalid("not_object");
            var type = Str(root, "type");
            return type switch
            {
                "config" => ParseConfig(root),
                "stop" => new InboundMessage.Stop(),
                "getReadLog" => new InboundMessage.GetReadLog(),
                null => new InboundMessage.Invalid("no_type"),
                _ => new InboundMessage.Invalid("unknown_type"),
            };
        }
        catch (JsonException)
        {
            return new InboundMessage.Invalid("bad_json");
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
                // Windows 分は "win": {"exe": [...]}。直下の "exe" も受ける（Mac 側の "bundleId" 等は無視）。
                if (a.TryGetProperty("win", out var win) && win.ValueKind == JsonValueKind.Object)
                    AddStrings(win, "exe", exe);
                AddStrings(a, "exe", exe);
                apps.Add(new OverlayApp(id, Str(a, "label") ?? id, exe, Bool(a, "enabled") ?? true));
            }
        }

        var url = Str(root, "panelUrl");
        if (url is not null && !IsAllowedPanelUrl(url)) url = null;

        return new InboundMessage.Config(new OverlayConfig(
            Enabled: Bool(root, "enabled") ?? true,
            Apps: apps,
            PanelUrl: url,
            BubbleSize: Math.Clamp(Int(root, "bubbleSize") ?? 44, 24, 96),
            Margin: Math.Clamp(Int(root, "margin") ?? 16, 0, 64),
            Ocr: Bool(root, "ocr") ?? true,
            MinChars: Math.Clamp(Int(root, "minChars") ?? 1, 1, 10_000)));
    }

    /// <summary>パネルに開いてよい URL。https か、手元の開発用の http://localhost・127.0.0.1 だけ。</summary>
    public static bool IsAllowedPanelUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) return false;
        if (u.Scheme == Uri.UriSchemeHttps) return true;
        return u.Scheme == Uri.UriSchemeHttp && (u.Host == "localhost" || u.Host == "127.0.0.1");
    }

    // ---- 出す行 ----

    public static string Ready(string version) => Write(w =>
    {
        w.WriteString("type", "ready");
        w.WriteString("platform", "windows");
        w.WriteNumber("protocol", Version);
        w.WriteString("version", version);
    });

    public static string Geometry(string app, Rect frame, Rect bubble, double scale) => Write(w =>
    {
        w.WriteString("type", "geometry");
        w.WriteString("app", app);
        WriteRect(w, "frame", frame);
        WriteRect(w, "bubble", bubble);
        w.WriteNumber("scale", Math.Round(scale, 3));
    });

    public static string Hidden(string reason, string? app = null) => Write(w =>
    {
        w.WriteString("type", "hidden");
        w.WriteString("reason", reason);
        if (app is not null) w.WriteString("app", app);
    });

    public static string Clicked(string app) => Write(w =>
    {
        w.WriteString("type", "clicked");
        w.WriteString("app", app);
    });

    /// <summary>読み取り1回の結果。文字数だけで、中身は載せない。</summary>
    public static string Read(string app, ReadMethod method, bool ok, int chars, string? reason = null) => Write(w =>
    {
        w.WriteString("type", "read");
        w.WriteString("app", app);
        w.WriteString("method", method.Wire());
        w.WriteBoolean("ok", ok);
        w.WriteNumber("chars", chars);
        if (reason is not null) w.WriteString("reason", reason);
    });

    public static string ReadLogLine(ReadLog log) => Write(w =>
    {
        w.WriteString("type", "readLog");
        w.WritePropertyName("apps");
        log.WriteJson(w);
    });

    public static string Error(string code, string? detail = null) => Write(w =>
    {
        w.WriteString("type", "error");
        w.WriteString("code", code);
        if (detail is not null) w.WriteString("detail", detail);
    });

    private static void WriteRect(Utf8JsonWriter w, string name, Rect r)
    {
        w.WriteStartObject(name);
        w.WriteNumber("x", r.X);
        w.WriteNumber("y", r.Y);
        w.WriteNumber("w", r.W);
        w.WriteNumber("h", r.H);
        w.WriteEndObject();
    }

    private static string Write(Action<Utf8JsonWriter> body)
    {
        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms))
        {
            w.WriteStartObject();
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
        o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) ? i : null;

    private static void AddStrings(JsonElement o, string name, List<string> into)
    {
        if (!o.TryGetProperty(name, out var v)) return;
        if (v.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(v.GetString())) into.Add(v.GetString()!);
        else if (v.ValueKind == JsonValueKind.Array)
            foreach (var e in v.EnumerateArray())
                if (e.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(e.GetString())) into.Add(e.GetString()!);
    }
}
