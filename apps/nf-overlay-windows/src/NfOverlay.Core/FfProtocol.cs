using System.Text.Json;

namespace NfOverlay.Core;

/// <summary>FF 先読みの全体キーの役目（docs/overlay-protocol.md「FF 先読み」）。</summary>
public enum FfAction { Trigger, Adopt, Close }

/// <summary>
/// キーを登録する範囲（ff-config の scopes）。Global は ff-config のあいだずっと全体キー、
/// OverlayOnly は行が出ている間だけ登録し、隠したら外す（他のアプリから奪わない）。
/// 既定は trigger だけ Global、adopt・close は OverlayOnly（keys.json v2）。
/// </summary>
public enum FfScope { Global, OverlayOnly }

/// <summary>ff-line の種類。move（手）・none（「記録なし」など）・info（「クリップボードに入れました」など）。</summary>
public enum FfLineKind { Move, None, Info }

/// <summary>
/// キーの正規形（Node の src/ff/keys.ts の FfChord と同じ）。mods は ctrl / alt / shift / meta（Windows では Win キー）、
/// key は小文字1文字（US 配列の位置）か名前（escape・space・f1〜f24）。OS のキーコードへは FfHotkey が直す。
/// </summary>
public sealed record FfChord(IReadOnlyList<string> Mods, string Key);

/// <summary>Node から受け取る FF の設定（{"v":1,"type":"ff-config",...}）。</summary>
public sealed record FfConfig(
    bool Enabled,
    IReadOnlyDictionary<FfAction, FfChord> Keys,
    IReadOnlyDictionary<FfAction, string> Labels,
    double Opacity = FfConfig.DefaultOpacity,
    IReadOnlyDictionary<FfAction, FfScope>? Scopes = null)
{
    public const double DefaultOpacity = 0.72;
    public const double MinOpacity = 0.3;
    public const double MaxOpacity = 0.95;

    /// <summary>scopes が無い・知らない値のときの範囲。</summary>
    public static FfScope DefaultScope(FfAction a) => a == FfAction.Trigger ? FfScope.Global : FfScope.OverlayOnly;

    public FfScope ScopeOf(FfAction a) =>
        Scopes is not null && Scopes.TryGetValue(a, out var s) ? s : DefaultScope(a);
}

/// <summary>半透明の1行（{"v":1,"type":"ff-line",...}）。press はネイティブが振った押下の番号。</summary>
public sealed record FfLine(int Press, int Seq, FfLineKind Kind, string Text, int? N = null, bool Reset = false);

/// <summary>その押下の最初の行を描いた、の報告（ff-drawn）。ms はキーを受けた時刻から描き終わりまで（単調時計）。</summary>
public sealed record FfDrawnReport(int Press, int Seq, double Ms);

public abstract partial record InboundMessage
{
    public sealed record FfConfigMsg(FfConfig Value) : InboundMessage;
    public sealed record FfLineMsg(FfLine Value) : InboundMessage;
    public sealed record FfHide : InboundMessage;
}

public static class FfActionExt
{
    public static string Wire(this FfAction a) => a switch
    {
        FfAction.Trigger => "trigger",
        FfAction.Adopt => "adopt",
        _ => "close",
    };
}

/// <summary>FF 先読みの行の読み書き。丸と同じ通り道・同じ v:1。</summary>
public static partial class Protocol
{
    /// <summary>1行の文字の上限。エンジンの label と支持数だけなので短いはず。長すぎる分は切る。</summary>
    public const int FfMaxTextChars = 400;

    private static readonly string[] FfMods = { "ctrl", "alt", "shift", "meta" };

    private static InboundMessage ParseFfConfig(JsonElement root)
    {
        var keys = new Dictionary<FfAction, FfChord>();
        var labels = new Dictionary<FfAction, string>();
        var scopes = new Dictionary<FfAction, FfScope>();
        foreach (var a in new[] { FfAction.Trigger, FfAction.Adopt, FfAction.Close })
        {
            if (root.TryGetProperty("keys", out var ks) && ks.ValueKind == JsonValueKind.Object
                && ks.TryGetProperty(a.Wire(), out var k) && ParseChord(k) is { } chord)
                keys[a] = chord;
            if (root.TryGetProperty("labels", out var ls) && ls.ValueKind == JsonValueKind.Object
                && Str(ls, a.Wire()) is { } label)
                labels[a] = label;
            scopes[a] = root.TryGetProperty("scopes", out var ss) && ss.ValueKind == JsonValueKind.Object
                ? Str(ss, a.Wire()) switch
                {
                    "global" => FfScope.Global,
                    "overlay-only" => FfScope.OverlayOnly,
                    _ => FfConfig.DefaultScope(a),
                }
                : FfConfig.DefaultScope(a);
        }
        double opacity = FfConfig.DefaultOpacity;
        if (root.TryGetProperty("opacity", out var o) && o.ValueKind == JsonValueKind.Number && o.TryGetDouble(out var d)
            && double.IsFinite(d))
            opacity = Math.Clamp(d, FfConfig.MinOpacity, FfConfig.MaxOpacity);
        return new InboundMessage.FfConfigMsg(new FfConfig(Bool(root, "enabled") ?? true, keys, labels, opacity, scopes));
    }

    /// <summary>{mods:[...], key} を読む。知らない mod は捨て、並びは ctrl・alt・shift・meta に揃える。key が無ければ null。</summary>
    private static FfChord? ParseChord(JsonElement k)
    {
        if (k.ValueKind != JsonValueKind.Object) return null;
        var key = Str(k, "key")?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(key)) return null;
        var mods = new List<string>();
        AddStrings(k, "mods", mods);
        var set = new HashSet<string>(mods.Select(m => m.Trim().ToLowerInvariant()));
        return new FfChord(FfMods.Where(set.Contains).ToArray(), key);
    }

    private static InboundMessage ParseFfLine(JsonElement root)
    {
        var press = Int(root, "press");
        if (press is null) return new InboundMessage.Malformed("no-press");
        var text = Str(root, "text");
        if (text is null) return new InboundMessage.Malformed("no-text");
        if (text.Length > FfMaxTextChars) text = text[..FfMaxTextChars];
        var kind = Str(root, "kind") switch
        {
            "move" => FfLineKind.Move,
            "none" => FfLineKind.None,
            _ => FfLineKind.Info, // 知らない kind は目立たない info として出す
        };
        return new InboundMessage.FfLineMsg(new FfLine(press.Value, Math.Max(0, Int(root, "seq") ?? 0), kind, text,
            Int(root, "n"), Bool(root, "reset") ?? false));
    }

    // ---- 出す行 ----

    /// <summary>全体キー（表示中は close も）を受けた。</summary>
    public static string FfKey(FfAction action, int press) => Write("ff-key", w =>
    {
        w.WriteString("action", action.Wire());
        w.WriteNumber("press", press);
    });

    /// <summary>その押下の最初の行を描いた。ms は 0.1 ミリ秒に丸める。</summary>
    public static string FfDrawn(int press, int seq, double ms) => Write("ff-drawn", w =>
    {
        w.WriteNumber("press", press);
        w.WriteNumber("seq", seq);
        w.WriteNumber("ms", Math.Round(Math.Max(0, ms), 1));
    });

    public static string FfDrawn(FfDrawnReport r) => FfDrawn(r.Press, r.Seq, r.Ms);

    /// <summary>全体キーの登録の結果。failed は登録できなかった役目（他のアプリが先に取っている・直せないキー）。</summary>
    public static string FfKeys(IReadOnlyCollection<FfAction> failed) => Write("ff-keys", w =>
    {
        w.WriteBoolean("ok", failed.Count == 0);
        w.WriteStartArray("failed");
        foreach (var a in failed.Distinct().OrderBy(a => a)) w.WriteStringValue(a.Wire());
        w.WriteEndArray();
    });
}
