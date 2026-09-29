using NfOverlay.Core;

namespace NfOverlay.Core.Tests;

/// <summary>
/// テスト用の設定。実行ファイル名は架空（"alpha-ai.exe" 等）で、実在のアプリの名前を推測で置かない。
/// </summary>
internal static class Fixtures
{
    public static readonly Rect Screen = new(0, 0, 1920, 1040); // 1920x1080 からタスクバー 40px を除いた作業領域

    public static OverlayConfig Config(bool enabled = true, bool alphaOn = true, bool betaOn = true,
        ReadMode alphaRead = ReadMode.UiaThenOcr) =>
        new(enabled,
            new[]
            {
                new OverlayApp("alpha", "Alpha AI", new[] { "alpha-ai.exe" }, alphaOn, alphaRead),
                new OverlayApp("beta", "Beta AI", new[] { "Beta.exe", "beta-canary.exe" }, betaOn),
            },
            "https://example.invalid/panel",
            BubbleSize: 44, Margin: 16, PanelMode: PanelMode.Url);

    /// <summary>OCR の同意の小窓の代わり。聞かれた回数を数える。</summary>
    public sealed class FakeConsent
    {
        public FakeConsent(bool answer) { Answer = answer; }
        public bool Answer { get; }
        public int Asked { get; private set; }
        public Task<bool> Ask(string app, CancellationToken ct) { Asked++; return Task.FromResult(Answer); }
    }

    public static WindowState Win(long hwnd, string exe, Rect frame, double scale = 1.0,
        bool minimized = false, bool own = false, Rect? work = null) =>
        new(hwnd, exe, frame, work ?? Screen, scale, minimized, false, own);

    public sealed class FakeReader : IAnswerReader
    {
        public FakeReader(ReadMethod method, string? result) { Method = method; Result = result; }
        public ReadMethod Method { get; }
        public string? Result { get; set; }
        public Exception? Throw { get; set; }
        public List<long> Calls { get; } = new();

        public Task<string?> ReadAsync(long window, CancellationToken ct)
        {
            Calls.Add(window);
            if (Throw is not null) throw Throw;
            return Task.FromResult(Result);
        }
    }
}
