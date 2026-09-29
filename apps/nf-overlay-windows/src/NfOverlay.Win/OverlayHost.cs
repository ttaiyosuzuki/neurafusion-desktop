using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using NfOverlay.Core;

namespace NfOverlay.Win;

/// <summary>
/// 全体のつなぎ（UI スレッドで動く）。標準入力の設定 → 前面の追跡 → 丸の表示 → 押したら1回だけ読む → パネルへ。
/// 標準出力には約束の行（文字数だけ）を出す。
/// </summary>
internal sealed class OverlayHost : ApplicationContext
{
    private readonly SynchronizationContext _ui;
    private readonly WindowWatcher _watcher = new();
    private readonly BubbleForm _bubble = new();
    private readonly PanelForm _panel;
    private readonly ReadGate _gate = new();
    private readonly ReadLog _log;
    private readonly ReadPlanner _planner;
    private readonly IAnswerReader _uia = new UiaReader();
    private readonly IAnswerReader _ocr = new OcrReader();
    private readonly string _logPath;
    private readonly object _outLock = new();
    private readonly FollowTracker _tracker = new(OverlayConfig.Off);
    private CancellationTokenSource? _reading;

    public OverlayHost()
    {
        _ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NeuraFusion", "overlay");
        Directory.CreateDirectory(dir);
        _logPath = Path.Combine(dir, "read-log.json");
        _log = ReadLog.FromJson(File.Exists(_logPath) ? SafeRead(_logPath) : null);
        _planner = new ReadPlanner(_gate, _log);
        _panel = new PanelForm(Path.Combine(dir, "webview2"));

        _bubble.BubbleClicked += () => _ = OnClickedAsync();
        _watcher.ForegroundChanged += s => Apply(_tracker.Update(s));
        _watcher.TargetMoved += s => Apply(_tracker.OnMoved(s));
        _watcher.Start();

        Emit(Protocol.Ready(typeof(OverlayHost).Assembly.GetName().Version?.ToString(3) ?? "0.0.0"));
        new Thread(ReadStdin) { IsBackground = true, Name = "nf-overlay-stdin" }.Start();
    }

    private void ReadStdin()
    {
        using var stdin = new StreamReader(Console.OpenStandardInput(), System.Text.Encoding.UTF8);
        string? line;
        while ((line = stdin.ReadLine()) is not null)
        {
            var msg = Protocol.Parse(line);
            _ui.Post(_ => OnMessage(msg), null);
            if (msg is InboundMessage.Stop) return;
        }
        // Node が終わった（標準入力が閉じた）ら一緒に終わる。
        _ui.Post(_ => ExitThread(), null);
    }

    private void OnMessage(InboundMessage msg)
    {
        switch (msg)
        {
            case InboundMessage.Config c:
                _gate.Reset();
                _panel.Configure(c.Value.PanelUrl);
                Apply(_tracker.Reconfigure(c.Value, _watcher.Foreground()));
                break;
            case InboundMessage.GetReadLog:
                Emit(Protocol.ReadLogLine(_log));
                break;
            case InboundMessage.Stop:
                ExitThread();
                break;
            case InboundMessage.Invalid i:
                Emit(Protocol.Error("bad_message", i.Reason));
                break;
        }
    }

    private void Apply(FollowUpdate? u)
    {
        _watcher.SetTarget(_tracker.Tracked);
        switch (u)
        {
            case FollowUpdate.Show s:
                _bubble.Place(s.Bubble);
                Emit(s.ToLine());
                break;
            case FollowUpdate.Hide h:
                _bubble.Conceal();
                Emit(h.ToLine());
                break;
        }
    }

    private async Task OnClickedAsync()
    {
        if (_tracker.Current is not { } cur) return;
        var exe = _watcher.Probe(new IntPtr(cur.Window))?.Exe ?? "";
        var ticket = _gate.OnClick(_tracker.Matcher.Match(exe), cur.Window, DateTimeOffset.UtcNow);
        if (ticket is null) return;
        Emit(Protocol.Clicked(ticket.App));

        var state = _watcher.Probe(new IntPtr(cur.Window));
        await _panel.OpenNear(cur.Bubble, state?.WorkArea ?? cur.Frame, cur.Scale);

        _reading?.Cancel();
        _reading = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        try
        {
            var outcome = await _planner.RunAsync(ticket, cur.Window, _tracker.Config, _uia, _ocr, _reading.Token);
            foreach (var line in outcome.ProtocolLines()) Emit(line);
            _panel.Deliver(outcome, outcome.Attempts.LastOrDefault(a => a.Ok)?.Method);
            SaveLog();
        }
        catch (OperationCanceledException)
        {
            Emit(Protocol.Error("read_timeout"));
        }
    }

    private void SaveLog()
    {
        try
        {
            var tmp = _logPath + ".tmp";
            File.WriteAllText(tmp, _log.ToJson());
            File.Move(tmp, _logPath, overwrite: true);
        }
        catch (IOException) { Emit(Protocol.Error("read_log_save_failed")); }
        catch (UnauthorizedAccessException) { Emit(Protocol.Error("read_log_save_failed")); }
    }

    private static string? SafeRead(string path)
    {
        try { return File.ReadAllText(path); }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }

    private void Emit(string line)
    {
        lock (_outLock)
        {
            Console.Out.WriteLine(line);
            Console.Out.Flush();
        }
    }

    protected override void ExitThreadCore()
    {
        _reading?.Cancel();
        _watcher.Dispose();
        _bubble.Dispose();
        _panel.Dispose();
        base.ExitThreadCore();
    }
}
