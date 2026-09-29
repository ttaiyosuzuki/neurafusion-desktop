using NfOverlay.Core;
using Xunit;
using static NfOverlay.Core.Tests.Fixtures;

namespace NfOverlay.Core.Tests;

/// <summary>TS-38（Windows 分）: 押すまで読まない。OCR は毎回同意を取る。「読めた・読めない」の記録が出る。</summary>
public class ReadTests
{
    private static readonly DateTimeOffset T0 = new(2026, 9, 29, 7, 0, 0, TimeSpan.Zero);

    private static (ReadGate gate, ReadLog log, ReadPlanner planner, AppMatcher m) Setup(Func<DateTimeOffset>? now = null)
    {
        var gate = new ReadGate();
        var log = new ReadLog();
        return (gate, log, new ReadPlanner(gate, log, now ?? (() => T0)), new AppMatcher(Config()));
    }

    private static readonly AskOcrConsent Yes = (_, _) => Task.FromResult(true);

    [Fact]
    public async Task Nothing_is_read_without_a_click()
    {
        var (_, log, planner, _) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "answer");
        var ocr = new FakeReader(ReadMethod.Ocr, "answer");
        var consent = new FakeConsent(true);
        var r = await planner.RunAsync(null, 7, Config(), uia, ocr, consent.Ask, default);
        Assert.False(r.Ok);
        Assert.Null(r.ProtocolLine());
        Assert.Empty(uia.Calls);
        Assert.Empty(ocr.Calls);
        Assert.Equal(0, consent.Asked);
        Assert.Empty(log.Snapshot());
    }

    [Fact]
    public async Task One_click_allows_exactly_one_read()
    {
        var (gate, _, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "the answer text");
        var ticket = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        var r1 = await planner.RunAsync(ticket, 7, Config(), uia, null, Yes, default);
        var r2 = await planner.RunAsync(ticket, 7, Config(), uia, null, Yes, default);
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
        Assert.False((await planner.RunAsync(t1, 8, Config(), uia, null, Yes, default)).Ok);

        var t2 = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        now = T0 + ReadGate.Lifetime + TimeSpan.FromSeconds(1);
        Assert.False((await planner.RunAsync(t2, 7, Config(), uia, null, Yes, default)).Ok);
        Assert.Empty(uia.Calls);
    }

    [Fact]
    public async Task Newer_click_invalidates_older_ticket()
    {
        var (gate, _, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "x");
        var old = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        var fresh = gate.OnClick(m.Match("alpha-ai.exe"), 7, T0);
        Assert.False((await planner.RunAsync(old, 7, Config(), uia, null, Yes, default)).Ok);
        Assert.True((await planner.RunAsync(fresh, 7, Config(), uia, null, Yes, default)).Ok);
    }

    [Fact]
    public async Task Falls_back_to_ocr_after_asking_consent_and_records_both()
    {
        var (gate, log, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "   ");
        var ocr = new FakeReader(ReadMethod.Ocr, "ocr text");
        var consent = new FakeConsent(true);
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(), uia, ocr, consent.Ask, default);

        Assert.Equal("ocr text", r.Text);
        Assert.Equal(1, consent.Asked);
        Assert.Equal(new[] { ReadMethod.Uia, ReadMethod.Ocr }, r.Attempts.Select(a => a.Method));
        Assert.Equal("uia-empty", r.Attempts[0].Reason);
        var s = log.Get("alpha");
        Assert.Equal((0, 1, 1, 0), (s.UiaOk, s.UiaNg, s.OcrOk, s.OcrNg));
        Assert.Equal("ocr", s.Status);
    }

    [Fact]
    public async Task Declined_consent_means_no_capture_and_no_unreadable_mark_for_ocr()
    {
        var (gate, log, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, null);
        var ocr = new FakeReader(ReadMethod.Ocr, "ocr text");
        var consent = new FakeConsent(false);
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(), uia, ocr, consent.Ask, default);

        Assert.False(r.Ok);
        Assert.Empty(ocr.Calls);
        Assert.Equal("consent-declined", r.Reason);
        Assert.Equal("none", r.Method);
        Assert.Equal(0, log.Get("alpha").OcrNg);
        Assert.Contains("\"reason\":\"consent-declined\"", r.ProtocolLine());
    }

    [Fact]
    public async Task No_consent_callback_means_no_capture()
    {
        var (gate, _, planner, m) = Setup();
        var ocr = new FakeReader(ReadMethod.Ocr, "ocr text");
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(),
            new FakeReader(ReadMethod.Uia, null), ocr, null, default);
        Assert.False(r.Ok);
        Assert.Empty(ocr.Calls);
    }

    [Fact]
    public async Task App_known_unreadable_by_uia_starts_with_ocr()
    {
        var (gate, log, planner, m) = Setup();
        log.Record("alpha", ReadMethod.Uia, false, T0);
        log.Record("alpha", ReadMethod.Ocr, true, T0);
        var uia = new FakeReader(ReadMethod.Uia, "uia text");
        var ocr = new FakeReader(ReadMethod.Ocr, "ocr text");
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(), uia, ocr, Yes, default);
        Assert.Equal("ocr text", r.Text);
        Assert.Empty(uia.Calls);
    }

    [Fact]
    public async Task Uia_only_app_never_captures()
    {
        var (gate, log, planner, _) = Setup();
        var cfg = Config(alphaRead: ReadMode.UiaOnly);
        var uia = new FakeReader(ReadMethod.Uia, null);
        var ocr = new FakeReader(ReadMethod.Ocr, "ocr text");
        var consent = new FakeConsent(true);
        var r = await planner.RunAsync(gate.OnClick(new AppMatcher(cfg).Match("alpha-ai.exe"), 7, T0), 7, cfg, uia, ocr, consent.Ask, default);
        Assert.False(r.Ok);
        Assert.Empty(ocr.Calls);
        Assert.Equal(0, consent.Asked);
        Assert.Equal("unreadable", log.Get("alpha").Status);
    }

    [Fact]
    public async Task Read_off_app_reads_nothing_but_reports_read_off()
    {
        var (gate, log, planner, _) = Setup();
        var cfg = Config(alphaRead: ReadMode.Off);
        var uia = new FakeReader(ReadMethod.Uia, "x");
        var r = await planner.RunAsync(gate.OnClick(new AppMatcher(cfg).Match("alpha-ai.exe"), 7, T0), 7, cfg, uia, null, Yes, default);
        Assert.Empty(uia.Calls);
        Assert.Equal("{\"v\":1,\"type\":\"read\",\"app\":\"alpha\",\"method\":\"none\",\"ok\":false,\"chars\":0,\"reason\":\"read-off\"}",
            r.ProtocolLine());
        Assert.Empty(log.Snapshot());
    }

    [Fact]
    public async Task Reader_exception_is_recorded_as_unreadable_without_message()
    {
        var (gate, log, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, null) { Throw = new InvalidOperationException("secret words") };
        var cfg = Config(alphaRead: ReadMode.UiaOnly);
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, cfg, uia, null, Yes, default);
        var a = Assert.Single(r.Attempts);
        Assert.Equal("uia-error", a.Reason);
        Assert.DoesNotContain("secret", r.ProtocolLine());
        Assert.Equal(1, log.Get("alpha").UiaNg);
    }

    [Fact]
    public async Task Read_line_carries_text_only_when_ok_and_log_never_has_text()
    {
        var (gate, log, planner, m) = Setup();
        var uia = new FakeReader(ReadMethod.Uia, "日本語の答え\n2行目");
        var r = await planner.RunAsync(gate.OnClick(m.Match("alpha-ai.exe"), 7, T0), 7, Config(), uia, null, Yes, default);
        Assert.Equal(
            "{\"v\":1,\"type\":\"read\",\"app\":\"alpha\",\"method\":\"uia\",\"ok\":true,\"chars\":10," +
            "\"attempts\":[{\"method\":\"uia\",\"ok\":true,\"chars\":10}],\"text\":\"日本語の答え\\n2行目\"}",
            r.ProtocolLine());
        Assert.DoesNotContain("日本語", log.ToJson());
        Assert.DoesNotContain("日本語", Protocol.ReadLogLine(log));
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
        Assert.Contains("\"type\":\"read-log\"", Protocol.ReadLogLine(back));
    }

    [Fact]
    public void Broken_read_log_file_starts_empty()
    {
        Assert.Empty(ReadLog.FromJson("{not json").Snapshot());
        Assert.Empty(ReadLog.FromJson("[1,2]").Snapshot());
        Assert.Empty(ReadLog.FromJson(null).Snapshot());
    }
}
