using System.Text.Json;

namespace NfOverlay.Core;

public enum ReadMethod { Uia, Ocr }

public static class ReadMethodExt
{
    public static string Wire(this ReadMethod m) => m == ReadMethod.Uia ? "uia" : "ocr";
}

/// <summary>アプリごとの「読めた・読めない」の数。文字の中身は持たない。</summary>
public sealed record AppReadStats
{
    public int UiaOk { get; init; }
    public int UiaNg { get; init; }
    public int OcrOk { get; init; }
    public int OcrNg { get; init; }
    public ReadMethod? LastMethod { get; init; }
    public bool? LastOk { get; init; }
    public DateTimeOffset? LastAt { get; init; }

    /// <summary>
    /// "uia"（UI Automation で読めた）/ "ocr"（撮影＋文字認識でだけ読めた）/
    /// "unreadable"（試したがどちらでも読めない）/ "untested"。
    /// </summary>
    public string Status =>
        UiaOk > 0 ? "uia"
        : OcrOk > 0 ? "ocr"
        : UiaNg + OcrNg > 0 ? "unreadable"
        : "untested";
}

/// <summary>
/// 読めた・読めないの記録（DK-03・TS-38）。ファイルに保存する場合も数だけで、生の文字は書かない。
/// </summary>
public sealed class ReadLog
{
    private readonly Dictionary<string, AppReadStats> _apps = new(StringComparer.Ordinal);
    private readonly object _lock = new();

    public IReadOnlyDictionary<string, AppReadStats> Snapshot()
    {
        lock (_lock) return new Dictionary<string, AppReadStats>(_apps);
    }

    public AppReadStats Get(string app)
    {
        lock (_lock) return _apps.TryGetValue(app, out var s) ? s : new AppReadStats();
    }

    public void Record(string app, ReadMethod method, bool ok, DateTimeOffset at)
    {
        lock (_lock)
        {
            var s = _apps.TryGetValue(app, out var cur) ? cur : new AppReadStats();
            s = method switch
            {
                ReadMethod.Uia when ok => s with { UiaOk = s.UiaOk + 1 },
                ReadMethod.Uia => s with { UiaNg = s.UiaNg + 1 },
                _ when ok => s with { OcrOk = s.OcrOk + 1 },
                _ => s with { OcrNg = s.OcrNg + 1 },
            };
            _apps[app] = s with { LastMethod = method, LastOk = ok, LastAt = at };
        }
    }

    /// <summary>
    /// 最初に試す方法。UI Automation を基本にし、そのアプリで UI Automation が一度も読めず
    /// OCR では読めたことがあるときだけ OCR から始める（読めないと分かっている方で待たせない）。
    /// </summary>
    public ReadMethod Preferred(string app)
    {
        var s = Get(app);
        return s.UiaOk == 0 && s.UiaNg > 0 && s.OcrOk > 0 ? ReadMethod.Ocr : ReadMethod.Uia;
    }

    public void WriteJson(Utf8JsonWriter w)
    {
        w.WriteStartObject();
        foreach (var (app, s) in Snapshot().OrderBy(kv => kv.Key, StringComparer.Ordinal))
        {
            w.WriteStartObject(app);
            w.WriteString("status", s.Status);
            w.WriteNumber("uiaOk", s.UiaOk);
            w.WriteNumber("uiaNg", s.UiaNg);
            w.WriteNumber("ocrOk", s.OcrOk);
            w.WriteNumber("ocrNg", s.OcrNg);
            if (s.LastMethod is { } m) w.WriteString("lastMethod", m.Wire());
            if (s.LastOk is { } ok) w.WriteBoolean("lastOk", ok);
            if (s.LastAt is { } at) w.WriteString("lastAt", at.ToString("o"));
            w.WriteEndObject();
        }
        w.WriteEndObject();
    }

    public string ToJson()
    {
        using var ms = new MemoryStream();
        using (var w = new Utf8JsonWriter(ms, new JsonWriterOptions { Indented = true })) WriteJson(w);
        return System.Text.Encoding.UTF8.GetString(ms.ToArray());
    }

    /// <summary>保存した記録を読む。壊れていたら空から始める（記録は数だけなので失っても害は無い）。</summary>
    public static ReadLog FromJson(string? json)
    {
        var log = new ReadLog();
        if (string.IsNullOrWhiteSpace(json)) return log;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return log;
            foreach (var p in doc.RootElement.EnumerateObject())
            {
                if (p.Value.ValueKind != JsonValueKind.Object) continue;
                var v = p.Value;
                int N(string k) => v.TryGetProperty(k, out var e) && e.TryGetInt32(out var i) && i >= 0 ? i : 0;
                ReadMethod? m = v.TryGetProperty("lastMethod", out var lm)
                    ? lm.GetString() switch { "uia" => ReadMethod.Uia, "ocr" => ReadMethod.Ocr, _ => null } : null;
                bool? ok = v.TryGetProperty("lastOk", out var lo) && lo.ValueKind is JsonValueKind.True or JsonValueKind.False
                    ? lo.GetBoolean() : null;
                DateTimeOffset? at = v.TryGetProperty("lastAt", out var la) && la.ValueKind == JsonValueKind.String
                    && DateTimeOffset.TryParse(la.GetString(), out var d) ? d : null;
                log._apps[p.Name] = new AppReadStats
                {
                    UiaOk = N("uiaOk"), UiaNg = N("uiaNg"), OcrOk = N("ocrOk"), OcrNg = N("ocrNg"),
                    LastMethod = m, LastOk = ok, LastAt = at,
                };
            }
        }
        catch (JsonException) { return new ReadLog(); }
        catch (InvalidOperationException) { return new ReadLog(); }
        return log;
    }
}
