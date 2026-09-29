using NfOverlay.Core;
using Xunit;
using static NfOverlay.Core.Tests.Fixtures;

namespace NfOverlay.Core.Tests;

/// <summary>TS-38（Windows 分）: 押すまで読まない。「読めた・読めない」の記録が出る。</summary>
public class ReadTests
{
    private static readonly DateTimeOffset T0 = new(2026, 9, 29, 7, 0, 0, TimeSpan.Zero);

    private static (ReadGate gate, ReadLog log, ReadPlanner planner, AppMatcher m) Setup(Func<DateTimeOffset>? now = null)
    {
        var gate = new ReadGate();
        var log = new ReadLog();
        return (gate, log, new ReadPlanner(gate, log, now ?? (() => T0)), new AppMatcher(Config()));
    }

    [Fact]
    public async Task Nothing_is_read_without_a_click()
    {
        var (_, log, planner, _) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "answer");
        var ocr = new FakeReader(ReadMethod.Ocr, "answer");
        var r = await planner.RunAsync(null, 7, Config(), uia, ocr, default);
        Assert.False(r.Ok);
        Assert.Empty(uia.Calls);
        Assert.Empty(ocr.Calls);
        Assert.Empty(log.Snapshot());
    }

    [Fact]
    public async Task One_click_allows_exactly_one_read()
    {
        var (gate, _, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "the answer text");
        var ticket = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        var r1 = await planner.RunAsync(ticket, 7, Config(), uia, null, default);
        var r2 = await planner.RunAsync(ticket, 7, Config(), uia, null, default);
        Assert.True(r1.Ok);
        Assert.Equal("the answer text", r1.Text);
        Assert.False(r2.Ok);
        Assert.Single(uia.Calls);
    }

    [Fact]
    public void Click_on_disabled_or_unknown_app_gives_no_ticket()
    {
        var gate = new ReadGate();
        Assert.Null(gate.OnClick(new AppMatcher(Config(alphaOn: false)).Match("alpha-ai.exe"), 7, T0));
        Assert.Null(gate.OnClick(new AppMatcher(Config(enabled: false)).Match("alpha-ai.exe"), 7, T0));
        Assert.Null(gate.OnClick(new AppMatcher(Config()).Match("notepad.exe"), 7, T0));
    }

    [Fact]
    public async Task Ticket_is_bound_to_the_clicked_window_and_expires()
    {
        var now = T0;
        var (gate, _, planner, m) = Setup(() => now);
        var uia = new FakeReader(ReadMethod.Uia, "x");

        var t1 = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        Assert.False((await planner.RunAsync(t1, 8, Config(), uia, null, default)).Ok);

        var t2 = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        now = T0 + ReadGate.Lifetime + TimeSpan.FromSeconds(1);
        Assert.False((await planner.RunAsync(t2, 7, Config(), uia, null, default)).Ok);
        Assert.Empty(uia.Calls);
    }

    [Fact]
    public async Task Newer_click_invalidates_older_ticket()
    {
        var (gate, _, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "x");
        var old = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        var fresh = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        Assert.False((await planner.RunAsync(old, 7, Config(), uia, null, default)).Ok);
        Assert.True((await planner.RunAsync(fresh, 7, Config(), uia, null, default)).Ok);
    }

    [Fact]
    public async Task Falls_back_to_ocr_when_uia_reads_nothing_and_records_both()
    {
        var (gate, log, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "   ");
        var ocr = new FakeReader(ReadMethod.Ocr, "ocr text");
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(), uia, ocr, default);

        Assert.Equal("ocr text", r.Text);
        Assert.Equal(new[] { ReadMethod.Uia, ReadMethod.Ocr }, r.Attempts.Select(a => a.Method));
        var s = log.Get("alpha");
        Assert.Equal((0, 1, 1, 0), (s.UiaOk, s.UiaNg, s.OcrOk, s.OcrNg));
        Assert.Equal("ocr", s.Status);
    }

    [Fact]
    public async Task App_known_unreadable_by_uia_starts_with_ocr()
    {
        var (gate, log, planner, m) = Setup();
        log.Record("alpha", ReadMethod.Uia, false, T0);
        log.Record("alpha", ReadMethod.Ocr, true, T0);
        var uia = new FakeReader(ReadMethod.Uia, "uia text");
        var ocr = new FakeReader(ReadMethod.Ocr, "ocr text");
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(), uia, ocr, default);
        Assert.Equal("ocr text", r.Text);
        Assert.Empty(uia.Calls);
    }

    [Fact]
    public async Task Ocr_off_in_config_is_never_called()
    {
        var (gate, log, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, null);
        var ocr = new FakeReader(ReadMethod.Ocr, "ocr text");
        var cfg = Config(ocr: false);
        var r = await planner.RunAsync(gate.OnClick(new AppMatcher(cfg).Match("alpha-ai.exe"), 7, T0), 7, cfg, uia, ocr, default);
        Assert.False(r.Ok);
        Assert.Empty(ocr.Calls);
        Assert.Equal("unreadable", log.Get("alpha").Status);
    }

    [Fact]
    public async Task Reader_exception_is_recorded_as_unreadable_without_message()
    {
        var (gate, log, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, null) { Throw = new InvalidOperationException("secret words") };
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(ocr: false), uia, null, default);
        var a = Assert.Single(r.Attempts);
        Assert.Equal("InvalidOperationException", a.Reason);
        Assert.DoesNotContain("secret", string.Concat(r.ProtocolLines()));
        Assert.Equal(1, log.Get("alpha").UiaNg);
    }

    [Fact]
    public async Task Read_lines_carry_char_count_but_not_text()
    {
        var (gate, _, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "private answer 123");
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(), uia, null, default);
        var line = Assert.Single(r.ProtocolLines());
        Assert.Equal("{\"type\":\"read\",\"app\":\"alpha\",\"method\":\"uia\",\"ok\":true,\"chars\":18}", line);
        Assert.DoesNotContain("private", line);
    }

    [Fact]
    public void Read_log_round_trips_counts_only()
    {
        var log = new ReadLog();
        log.Record("alpha", ReadMethod.Uia, true, T0);
        log.Record("beta", ReadMethod.Uia, false, T0);
        log.Record("beta", ReadMethod.Ocr, false, T0);
        var back = ReadLog.FromJson(log.ToJson());
        Assert.Equal("uia", back.Get("alpha").Status);
        Assert.Equal("unreadable", back.Get("beta").Status);
        Assert.Equal("untested", back.Get("gamma").Status);
        Assert.Equal(ReadMethod.Ocr, back.Get("beta").LastMethod);
        Assert.Contains("\"type\":\"readLog\"", Protocol.ReadLogLine(back));
    }

    [Fact]
    public void Broken_read_log_file_starts_empty()
    {
        Assert.Empty(ReadLog.FromJson("{not json").Snapshot());
        Assert.Empty(ReadLog.FromJson("[1,2]").Snapshot());
        Assert.Empty(ReadLog.FromJson(null).Snapshot());
    }
}
