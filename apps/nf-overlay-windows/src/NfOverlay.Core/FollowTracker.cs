namespace NfOverlay.Core;

/// <summary>前面ウィンドウの形（位置・大きさ・状態）。中身の文字は含まない。</summary>
public sealed record WindowState(
    long Window,
    string Exe,
    Rect Frame,
    Rect WorkArea,
    double Scale,
    bool Minimized = false,
    bool Cloaked = false,
    bool OwnProcess = false);

public abstract record FollowUpdate
{
    public sealed record Show(string App, long Window, Rect Frame, Rect Bubble, double Scale) : FollowUpdate
    {
        public string ToLine() => Protocol.Geometry(App, Frame, Bubble, Scale);
    }

    /// <param name="Reason">細かい理由（off / app_off / not_target / no_foreground / minimized / cloaked / too_small）。</param>
    public sealed record Hide(string Reason, string? App) : FollowUpdate
    {
        /// <summary>約束の reason（not-target / disabled / no-window）に寄せ、細かい理由は detail に入れる。</summary>
        public string WireReason => Reason switch
        {
            "not_target" => "not-target",
            "off" or "app_off" => "disabled",
            _ => "no-window",
        };

        public string ToLine() => Protocol.Hidden(WireReason, Reason.Replace('_', '-'), App);
    }
}

/// <summary>
/// 丸の追従（TS-38: 移動・大きさの変更についていく、オン・オフが効く）。
/// Windows 側は「前面が変わった」「対象の位置が変わった」ときに今の形を渡すだけで、
/// 見せる・隠す・どこに置くかはここで決める。前と同じなら何も返さない（同じ行を出し続けない）。
/// </summary>
public sealed class FollowTracker
{
    private OverlayConfig _config;
    private AppMatcher _matcher;
    private FollowUpdate? _last;
    private long _tracked;

    public FollowTracker(OverlayConfig config)
    {
        _config = config;
        _matcher = new AppMatcher(config);
    }

    public OverlayConfig Config => _config;
    public AppMatcher Matcher => _matcher;

    /// <summary>位置の変化を受け取る対象のウィンドウ（最小化などで丸が隠れていても追い続ける）。0 なら無し。</summary>
    public long Tracked => _tracked;

    /// <summary>今、丸が重なっている対象（押されたときに読むウィンドウ）。隠れていれば null。</summary>
    public FollowUpdate.Show? Current => _last as FollowUpdate.Show;

    /// <summary>設定が変わった。次の Update で必ず見直す。</summary>
    public FollowUpdate? Reconfigure(OverlayConfig config, WindowState? foreground)
    {
        _config = config;
        _matcher = new AppMatcher(config);
        _last = null;
        _tracked = 0;
        return Update(foreground);
    }

    public FollowUpdate? Update(WindowState? fg)
    {
        // 自分の丸・パネルが前面に来たときは、直前の対象のまま（丸を消さない）。
        if (fg is { OwnProcess: true }) return null;
        return Emit(Decide(fg));
    }

    /// <summary>対象の位置が変わったという知らせ。今の対象と違うウィンドウなら無視する。</summary>
    public FollowUpdate? OnMoved(WindowState state)
    {
        if (_tracked == 0 || _tracked != state.Window) return null;
        return Emit(Decide(state));
    }

    private FollowUpdate Decide(WindowState? fg)
    {
        var update = DecideShape(fg, out var on);
        _tracked = on && fg is not null ? fg.Window : 0;
        return update;
    }

    private FollowUpdate DecideShape(WindowState? fg, out bool on)
    {
        on = false;
        if (!_config.Enabled) return new FollowUpdate.Hide("off", null);
        if (fg is null) return new FollowUpdate.Hide("no_foreground", null);

        var m = _matcher.Match(fg.Exe);
        switch (m.State)
        {
            case MatchState.NotTarget: return new FollowUpdate.Hide("not_target", null);
            case MatchState.GlobalOff: return new FollowUpdate.Hide("off", m.App!.Id);
            case MatchState.AppOff: return new FollowUpdate.Hide("app_off", m.App!.Id);
        }

        var id = m.App!.Id;
        on = true;
        if (fg.Minimized) return new FollowUpdate.Hide("minimized", id);
        if (fg.Cloaked) return new FollowUpdate.Hide("cloaked", id);

        var bubble = BubbleLayout.Place(fg.Frame, fg.WorkArea, fg.Scale, _config.BubbleSize, _config.Margin);
        if (bubble is null) return new FollowUpdate.Hide("too_small", id);
        return new FollowUpdate.Show(id, fg.Window, fg.Frame, bubble.Value, fg.Scale);
    }

    private FollowUpdate? Emit(FollowUpdate next)
    {
        if (Equals(next, _last)) return null;
        _last = next;
        return next;
    }
}
