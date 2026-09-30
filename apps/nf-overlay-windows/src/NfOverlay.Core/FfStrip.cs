namespace NfOverlay.Core;

/// <summary>
/// FF 先読みの行の窓の状態（OS を呼ばない。Win 側は時刻を渡し、返ってきた答えどおりに窓とキーを動かす）。
/// - 押下の番号（press）は起動から1ずつ増える。キーを受けた時刻（単調時計のタイムスタンプ）を押下ごとに覚える。
/// - ff-line は窓が出ていなければ出す。reset:true なら前の行を消してから足す。
/// - その押下の最初の行が描かれたら1回だけ ff-drawn（同じ押下の2行目以降・描き直しでは出さない）。
/// - scope が OverlayOnly のキー（既定では adopt・close）は行が出ている間だけ登録する（他のアプリから奪わない）。
///   Global のキー（既定では trigger だけ）は ff-config で enabled のあいだずっと登録する。
/// </summary>
public sealed class FfStrip
{
    /// <summary>窓に残す行の上限（古い方から消す）。</summary>
    public const int MaxLines = 8;
    /// <summary>キーの時刻を覚えておく押下の数（答えの来ない押下で膨らまないように）。</summary>
    private const int KeepPresses = 32;

    private readonly List<FfLine> _lines = new();
    private readonly Dictionary<int, long> _keyAt = new();
    private readonly HashSet<int> _drawn = new();
    private IReadOnlyDictionary<FfAction, FfScope>? _scopes;

    /// <summary>ff-config の enabled。ff-config が来るまでは false（キーも行も出さない）。</summary>
    public bool Enabled { get; private set; }
    /// <summary>最後に振った押下の番号（まだ押されていなければ 0）。</summary>
    public int Press { get; private set; }
    public bool Visible { get; private set; }
    public IReadOnlyList<FfLine> Lines => _lines;
    /// <summary>close を登録しておくべきか（既定の scope では行が出ている間だけ）。</summary>
    public bool WantsClose => Wants(FfAction.Close);

    public FfScope ScopeOf(FfAction a) =>
        _scopes is not null && _scopes.TryGetValue(a, out var s) ? s : FfConfig.DefaultScope(a);

    /// <summary>今この役目のキーを登録しておくべきか。オフなら全部外す。OverlayOnly は行が出ている間だけ。</summary>
    public bool Wants(FfAction a) => Enabled && (ScopeOf(a) == FfScope.Global || Visible);

    /// <summary>ff-config。オフにしたら行も消す。scopes が無ければ既定（trigger だけ Global）。</summary>
    public void Configure(bool enabled, IReadOnlyDictionary<FfAction, FfScope>? scopes = null)
    {
        Enabled = enabled;
        _scopes = scopes;
        if (!enabled) Hide();
    }

    public void Configure(FfConfig c) => Configure(c.Enabled, c.Scopes);

    /// <summary>全体キーを受けた。新しい押下の番号を返す（ff-key に載せる）。</summary>
    public int OnKey(long timestamp)
    {
        Press++;
        _keyAt[Press] = timestamp;
        _keyAt.Remove(Press - KeepPresses);
        _drawn.Remove(Press - KeepPresses);
        return Press;
    }

    /// <summary>ff-line を足す。オフのときは足さずに false。</summary>
    public bool OnLine(FfLine line)
    {
        if (!Enabled) return false;
        if (line.Reset) _lines.Clear();
        _lines.Add(line);
        if (_lines.Count > MaxLines) _lines.RemoveRange(0, _lines.Count - MaxLines);
        Visible = true;
        return true;
    }

    /// <summary>
    /// 窓を描き終えた。描いた行（上から順）のうち、まだ報告していない押下の最初の行ごとに ff-drawn の中身を返す。
    /// ms = (描き終えた時刻 − キーを受けた時刻) ÷ frequency × 1000。キーの時刻が無い押下（知らない番号）は報告しない。
    /// </summary>
    public IReadOnlyList<FfDrawnReport> OnPainted(IReadOnlyList<FfLine> painted, long timestamp, long frequency)
    {
        var reports = new List<FfDrawnReport>();
        if (frequency <= 0) return reports;
        foreach (var line in painted)
        {
            if (_drawn.Contains(line.Press) || !_keyAt.TryGetValue(line.Press, out var at)) continue;
            _drawn.Add(line.Press);
            reports.Add(new FfDrawnReport(line.Press, line.Seq, Math.Max(0, timestamp - at) * 1000.0 / frequency));
        }
        return reports;
    }

    /// <summary>ff-hide・close・オフ。行を消して隠す（OverlayOnly のキーは外すべき状態になる）。</summary>
    public void Hide()
    {
        _lines.Clear();
        Visible = false;
    }
}
