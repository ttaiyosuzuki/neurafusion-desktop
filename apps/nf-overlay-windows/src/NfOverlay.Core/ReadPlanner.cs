namespace NfOverlay.Core;

/// <summary>答えを読む部品（UI Automation または 撮影＋OCR）。Windows 側で実装する。</summary>
public interface IAnswerReader
{
    ReadMethod Method { get; }
    /// <summary>そのウィンドウだけを読む。読めなければ null か空文字。</summary>
    Task<string?> ReadAsync(long window, CancellationToken ct);
}

/// <summary>画面を撮る前に、毎回本人に聞く（§8-3）。true なら撮ってよい。</summary>
public delegate Task<bool> AskOcrConsent(string app, CancellationToken ct);

public sealed record ReadAttempt(ReadMethod Method, bool Ok, int Chars, string? Reason);

/// <summary>押した1回の結果。</summary>
public sealed record ReadOutcome(string App, string? Text, IReadOnlyList<ReadAttempt> Attempts, string? Reason, bool Allowed = true)
{
    public bool Ok => Text is not null;

    /// <summary>読めた方法。読めなかったとき（両方失敗・同意なし・オフ）は "none"。各回の中身は Attempts。</summary>
    public string Method => Attempts.FirstOrDefault(a => a.Ok)?.Method.Wire() ?? "none";

    /// <summary>標準出力へ出す1行。門を通らなかった（押していない）ときは出さない。</summary>
    public string? ProtocolLine() =>
        Allowed ? Protocol.Read(App, Method, Ok, Text?.Length ?? 0, Ok ? null : Reason, Text, Attempts) : null;
}

/// <summary>
/// 押した1回の読み取りの手順: 門を通す → 記録から最初の方法を決める → 読めなければもう片方（OCR は毎回同意を取る）→ 記録する。
/// 記録（ReadLog）には数だけを残す。同意を断られた・読み取りがオフのときは「読めない」とは記録しない。
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
        IAnswerReader uia, IAnswerReader? ocr, AskOcrConsent? askConsent, CancellationToken ct)
    {
        var appId = ticket?.App ?? "";
        if (!_gate.TryConsume(ticket, window, _now()))
            return new ReadOutcome(appId, null, Array.Empty<ReadAttempt>(), null, Allowed: false);

        var mode = config.Apps.FirstOrDefault(a => a.Id == appId)?.Read ?? ReadMode.UiaThenOcr;
        if (mode == ReadMode.Off)
            return new ReadOutcome(appId, null, Array.Empty<ReadAttempt>(), ReadReason.ReadOff);

        var order = mode == ReadMode.UiaOnly ? new[] { ReadMethod.Uia }
            : _log.Preferred(appId) == ReadMethod.Ocr ? new[] { ReadMethod.Ocr, ReadMethod.Uia }
            : new[] { ReadMethod.Uia, ReadMethod.Ocr };

        var attempts = new List<ReadAttempt>();
        string? lastReason = null;
        foreach (var method in order)
        {
            var reader = method == ReadMethod.Uia ? uia : ocr;
            if (reader is null) continue;

            if (method == ReadMethod.Ocr && config.OcrAskEachTime)
            {
                var yes = askConsent is not null && await askConsent(appId, ct).ConfigureAwait(false);
                if (!yes)
                {
                    lastReason = ReadReason.ConsentDeclined;
                    continue;
                }
            }

            string? text = null; var failed = false;
            try
            {
                text = await reader.ReadAsync(window, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception)
            {
                // 例外のメッセージは他のアプリの文字を含みうるので、残さない。
                failed = true;
            }

            var trimmed = text?.Trim() ?? "";
            var ok = !failed && trimmed.Length >= config.MinChars;
            string? reason = ok ? null
                : method == ReadMethod.Uia ? (failed ? ReadReason.UiaError : ReadReason.UiaEmpty)
                : (failed ? ReadReason.OcrError : ReadReason.OcrEmpty);
            attempts.Add(new ReadAttempt(method, ok, trimmed.Length, reason));
            _log.Record(appId, method, ok, _now());
            if (ok) return new ReadOutcome(appId, trimmed, attempts, null);
            lastReason = reason;
        }
        return new ReadOutcome(appId, null, attempts, lastReason);
    }
}
