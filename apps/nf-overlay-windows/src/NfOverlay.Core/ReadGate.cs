namespace NfOverlay.Core;

/// <summary>
/// 丸が押されたことの印。コンストラクタは internal なので、Windows 側のコード（NfOverlay.Win）からは
/// 作れない。読み取りの部品はこの印を受け取らないと動かない = 押す前には読めない。
/// </summary>
public sealed class ReadTicket
{
    internal ReadTicket(long serial, string app, long window, DateTimeOffset issuedAt)
    {
        Serial = serial; App = app; Window = window; IssuedAt = issuedAt;
    }

    public long Serial { get; }
    public string App { get; }
    /// <summary>押したときに丸が重なっていたウィンドウ（HWND）。別のウィンドウは読まない。</summary>
    public long Window { get; }
    public DateTimeOffset IssuedAt { get; }
}

/// <summary>
/// 押すまで読まない門（§8-1）。押した1回につき、読み取りの開始を1回だけ許す。
/// 印は短い時間で切れる（押してから時間がたったものは使わない）。
/// </summary>
public sealed class ReadGate
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromSeconds(10);

    private readonly object _lock = new();
    private long _serial;
    private ReadTicket? _pending;

    /// <summary>丸が押された。対象がオンのときだけ印を出す。</summary>
    public ReadTicket? OnClick(MatchResult match, long window, DateTimeOffset now)
    {
        if (!match.IsOn || match.App is null || window == 0) return null;
        lock (_lock)
        {
            // 前の印がまだ使われていなくても、新しく押した方だけを有効にする。
            _pending = new ReadTicket(++_serial, match.App.Id, window, now);
            return _pending;
        }
    }

    /// <summary>読み取りを始めてよいか。同じ印は2度通らない。</summary>
    public bool TryConsume(ReadTicket? ticket, long window, DateTimeOffset now)
    {
        if (ticket is null) return false;
        lock (_lock)
        {
            if (!ReferenceEquals(_pending, ticket)) return false;
            _pending = null;
            if (ticket.Window != window) return false;
            if (now < ticket.IssuedAt || now - ticket.IssuedAt > Lifetime) return false;
            return true;
        }
    }

    /// <summary>設定が変わった・止めるときは、使われていない印を捨てる。</summary>
    public void Reset()
    {
        lock (_lock) _pending = null;
    }
}
