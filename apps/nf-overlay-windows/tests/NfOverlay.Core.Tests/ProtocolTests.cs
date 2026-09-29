using NfOverlay.Core;
using Xunit;

namespace NfOverlay.Core.Tests;

/// <summary>docs/overlay-protocol.md（dk-mac と共通）の形で読み書きできること。</summary>
public class ProtocolTests
{
    [Fact]
    public void Parses_shared_config_shape()
    {
        var msg = Protocol.Parse(
            "{\"v\":1,\"type\":\"config\",\"panelUrl\":\"http://127.0.0.1:8787/panel\",\"panelMode\":\"url\"," +
            "\"ocrConsent\":\"ask-each-time\",\"size\":40,\"margin\":12," +
            "\"apps\":[{\"id\":\"alpha\",\"label\":\"Alpha\",\"mac\":[\"x.y\"],\"win\":[\"a.exe\",\"b.exe\"],\"enabled\":false,\"read\":\"ax-only\"}," +
            "{\"id\":\"beta\",\"label\":\"Beta\",\"mac\":[],\"win\":[],\"enabled\":true,\"read\":\"off\"},{\"label\":\"no id\"}]}");
        var cfg = Assert.IsType<InboundMessage.Config>(msg).Value;
        Assert.True(cfg.Enabled);
        Assert.True(cfg.OcrAskEachTime);
        Assert.Equal(PanelMode.Url, cfg.PanelMode);
        Assert.Equal("http://127.0.0.1:8787/panel", cfg.PanelUrl);
        Assert.Equal((40, 12), (cfg.BubbleSize, cfg.Margin));
        Assert.Equal(2, cfg.Apps.Count);
        Assert.Equal(new[] { "a.exe", "b.exe" }, cfg.Apps[0].Exe);
        Assert.False(cfg.Apps[0].Enabled);
        Assert.Equal(ReadMode.UiaOnly, cfg.Apps[0].Read);
        Assert.Empty(cfg.Apps[1].Exe);
        Assert.Equal(ReadMode.Off, cfg.Apps[1].Read);
    }

    [Fact]
    public void Also_accepts_win_object_form()
    {
        var cfg = Assert.IsType<InboundMessage.Config>(Protocol.Parse(
            "{\"type\":\"config\",\"apps\":[{\"id\":\"a\",\"win\":{\"exe\":[\"x.exe\"]}}]}")).Value;
        Assert.Equal(new[] { "x.exe" }, cfg.Apps[0].Exe);
        Assert.Equal(ReadMode.UiaThenOcr, cfg.Apps[0].Read);
    }

    [Fact]
    public void Url_mode_without_valid_url_falls_back_to_disconnected()
    {
        var cfg = Assert.IsType<InboundMessage.Config>(
            Protocol.Parse("{\"type\":\"config\",\"panelMode\":\"url\",\"panelUrl\":\"file:///etc/passwd\"}")).Value;
        Assert.Null(cfg.PanelUrl);
        Assert.Equal(PanelMode.Disconnected, cfg.PanelMode);
    }

    [Theory]
    [InlineData("https://nf.example/panel", true)]
    [InlineData("http://localhost:5173/panel", true)]
    [InlineData("http://127.0.0.1:8080/", true)]
    [InlineData("http://nf.example/panel", false)]
    [InlineData("file:///C:/x.html", false)]
    [InlineData("javascript:alert(1)", false)]
    public void Panel_url_is_limited_to_https_or_localhost(string url, bool ok)
    {
        Assert.Equal(ok, Protocol.IsAllowedPanelUrl(url));
    }

    [Fact]
    public void Clamps_size_and_margin()
    {
        var cfg = Assert.IsType<InboundMessage.Config>(
            Protocol.Parse("{\"type\":\"config\",\"size\":1000,\"margin\":-5}")).Value;
        Assert.Equal(96, cfg.BubbleSize);
        Assert.Equal(0, cfg.Margin);
    }

    [Theory]
    [InlineData("", "empty")]
    [InlineData("nope", "bad-json")]
    [InlineData("[]", "not-object")]
    [InlineData("{}", "no-type")]
    [InlineData("{\"type\":\"panel-text\"}", "no-text")]
    public void Bad_lines_are_malformed_not_fatal(string line, string reason)
    {
        Assert.Equal(reason, Assert.IsType<InboundMessage.Malformed>(Protocol.Parse(line)).Reason);
    }

    [Fact]
    public void Unknown_types_are_skipped_for_forward_compat()
    {
        Assert.Equal("dance", Assert.IsType<InboundMessage.Unknown>(Protocol.Parse("{\"v\":2,\"type\":\"dance\"}")).Type);
    }

    [Fact]
    public void Parses_stop_panel_text_and_read_log_request()
    {
        Assert.IsType<InboundMessage.Stop>(Protocol.Parse("{\"v\":1,\"type\":\"stop\"}"));
        Assert.Equal("scrubbed", Assert.IsType<InboundMessage.PanelText>(
            Protocol.Parse("{\"v\":1,\"type\":\"panel-text\",\"text\":\"scrubbed\"}")).Text);
        Assert.IsType<InboundMessage.GetReadLog>(Protocol.Parse("{\"type\":\"get-read-log\"}"));
    }

    [Fact]
    public void Outbound_lines_are_single_line_json_with_version()
    {
        foreach (var line in new[]
        {
            Protocol.Ready("0.1.0"), Protocol.Clicked("alpha"), Protocol.Hidden("disabled", "app-off", "alpha"),
            Protocol.Error("x", "y"), Protocol.Panel(true, PanelMode.Disconnected),
            Protocol.Read("alpha", "none", false, 0, "ocr-empty", "must not appear"),
        })
        {
            Assert.DoesNotContain('\n', line);
            Assert.StartsWith("{\"v\":1,\"type\":", line);
            Assert.DoesNotContain("must not appear", line);
        }
        Assert.Equal("{\"v\":1,\"type\":\"ready\",\"platform\":\"windows\",\"uia\":true,\"screen\":true,\"version\":\"0.1.0\"}",
            Protocol.Ready("0.1.0"));
        Assert.Equal("{\"v\":1,\"type\":\"panel\",\"open\":true,\"mode\":\"url\"}", Protocol.Panel(true, PanelMode.Url));
    }
}
