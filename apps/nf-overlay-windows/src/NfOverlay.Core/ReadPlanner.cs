namespace NfOverlay.Core;

/// <summary>答えを読む部品（UI Automation または 撮影＋OCR）。Windows 側で実装する。</summary>
public interface IAnswerReader
{
    ReadMethod Method { get; }
    /// <summary>そのウィンドウだけを読む。読めなければ null か空文字。</summary>
    Task<string?> ReadAsync(long window, CancellationToken ct);
}

public sealed record ReadAttempt(ReadMethod Method, bool Ok, int Chars, string? Reason);

/// <summary>1回押したときの結果。Text はパネルに渡す分だけで、標準出力・ログには出さない。</summary>
public sealed record ReadOutcome(string App, string? Text, IReadOnlyList<ReadAttempt> Attempts)
{
    public bool Ok => Text is not null;

    /// <summary>標準出力へ出す行（文字数だけ）。</summary>
    public IEnumerable<string> ProtocolLines() =>
        Attempts.Select(a => Protocol.Read(App, a.Method, a.Ok, a.Chars, a.Reason));
}

/// <summary>
/// 押した1回の読み取りの手順: 門を通す → 記録から最初の方法を決める → 読めなければもう片方 → 記録する。
/// </summary>
public sealed class ReadPlanner
{
    private readonly ReadGate _gate;
    private readonly ReadLog _log;
    private readonly Func<DateTimeOffset> _now;

    public ReadPlanner(ReadGate gate, ReadLog log, Func<DateTimeOffset>? now = null)
    {
        _gate = gate; _log = log; _now = now ?? (() => DateTimeOffset.UtcNow);
    }

    public async Task<ReadOutcome> RunAsync(
        ReadTicket? ticket, long window, OverlayConfig config,
        IAnswerReader uia, IAnswerReader? ocr, CancellationToken ct)
    {
        var app = ticket?.App ?? "";
        if (!_gate.TryConsume(ticket, window, _now()))
            return new ReadOutcome(app, null, Array.Empty<ReadAttempt>());

        var order = _log.Preferred(app) == ReadMethod.Ocr
            ? new[] { ReadMethod.Ocr, ReadMethod.Uia }
            : new[] { ReadMethod.Uia, ReadMethod.Ocr };

        var attempts = new List<ReadAttempt>();
        foreach (var method in order)
        {
            var reader = method == ReadMethod.Uia ? uia : ocr;
            if (reader is null || (method == ReadMethod.Ocr && !config.Ocr)) continue;

            string? text = null; string? reason = null;
            try
            {
                text = await reader.ReadAsync(window, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                // 例外のメッセージは他のアプリの文字を含みうるので、型名だけを残す。
                reason = ex.GetType().Name;
            }

            var trimmed = text?.Trim() ?? "";
            var ok = trimmed.Length >= config.MinChars;
            if (!ok && reason is null) reason = trimmed.Length == 0 ? "empty" : "too_short";
            attempts.Add(new ReadAttempt(method, ok, trimmed.Length, ok ? null : reason));
            _log.Record(app, method, ok, _now());
            if (ok) return new ReadOutcome(app, trimmed, attempts);
        }
        return new ReadOutcome(app, null, attempts);
    }
}
