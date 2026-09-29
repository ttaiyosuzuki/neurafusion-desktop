namespace NfOverlay.Core;

/// <summary>前面のプロセスの実行ファイルから、対応アプリとオン・オフを決める。</summary>
public sealed class AppMatcher
{
    private readonly OverlayConfig _config;
    private readonly Dictionary<string, OverlayApp> _byExe = new(StringComparer.OrdinalIgnoreCase);

    public AppMatcher(OverlayConfig config)
    {
        _config = config;
        foreach (var app in config.Apps)
            foreach (var exe in app.Exe)
            {
                var key = Normalize(exe);
                // 同じ実行ファイル名が2つのアプリに書かれていたら、先に来た方を使う。
                if (key.Length > 0) _byExe.TryAdd(key, app);
            }
    }

    /// <summary>"C:\\...\\Claude.exe"・"claude.exe"・"Claude" を同じ "claude" にそろえる。</summary>
    public static string Normalize(string exeOrPath)
    {
        var s = exeOrPath.Trim().Trim('"');
        var slash = Math.Max(s.LastIndexOf('\\'), s.LastIndexOf('/'));
        if (slash >= 0) s = s[(slash + 1)..];
        if (s.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) s = s[..^4];
        return s.ToLowerInvariant();
    }

    /// <summary>レジストリに載っているアプリか（オン・オフは問わない）。</summary>
    public OverlayApp? Find(string exeOrPath) =>
        _byExe.TryGetValue(Normalize(exeOrPath), out var app) ? app : null;

    public MatchResult Match(string exeOrPath)
    {
        var app = Find(exeOrPath);
        if (app is null) return new MatchResult(null, MatchState.NotTarget);
        if (!_config.Enabled) return new MatchResult(app, MatchState.GlobalOff);
        if (!app.Enabled) return new MatchResult(app, MatchState.AppOff);
        return new MatchResult(app, MatchState.On);
    }
}

public enum MatchState { On, NotTarget, GlobalOff, AppOff }

public readonly record struct MatchResult(OverlayApp? App, MatchState State)
{
    public bool IsOn => State == MatchState.On;
}
