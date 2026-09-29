using NfOverlay.Core;
using Xunit;

namespace NfOverlay.Core.Tests;

public class ProtocolTests
{
    [Fact]
    public void Parses_config_with_windows_exe_list()
    {
        var msg = Protocol.Parse(
            "{\"type\":\"config\",\"enabled\":true,\"panelUrl\":\"https://example.invalid/p\",\"ocr\":false," +
            "\"apps\":[{\"id\":\"alpha\",\"label\":\"Alpha\",\"enabled\":false,\"win\":{\"exe\":[\"a.exe\",\"b.exe\"]}," +
            "\"mac\":{\"bundleId\":\"x.y\"}},{\"id\":\"beta\",\"exe\":\"beta.exe\"},{\"label\":\"no id\"}]}");
        var cfg = Assert.IsType<InboundMessage.Config>(msg).Value;
        Assert.True(cfg.Enabled);
        Assert.False(cfg.Ocr);
        Assert.Equal("https://example.invalid/p", cfg.PanelUrl);
        Assert.Equal(2, cfg.Apps.Count);
        Assert.Equal(new[] { "a.exe", "b.exe" }, cfg.Apps[0].Exe);
        Assert.False(cfg.Apps[0].Enabled);
        Assert.True(cfg.Apps[1].Enabled);
        Assert.Equal("beta", cfg.Apps[1].Label);
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
    public void Disallowed_panel_url_becomes_null()
    {
        var cfg = Assert.IsType<InboundMessage.Config>(
            Protocol.Parse("{\"type\":\"config\",\"panelUrl\":\"file:///etc/passwd\"}")).Value;
        Assert.Null(cfg.PanelUrl);
        Assert.Empty(cfg.Apps);
    }

    [Fact]
    public void Clamps_bubble_size_and_margin()
    {
        var cfg = Assert.IsType<InboundMessage.Config>(
            Protocol.Parse("{\"type\":\"config\",\"bubbleSize\":1000,\"margin\":-5}")).Value;
        Assert.Equal(96, cfg.BubbleSize);
        Assert.Equal(0, cfg.Margin);
    }

    [Theory]
    [InlineData("", "empty")]
    [InlineData("nope", "bad_json")]
    [InlineData("[]", "not_object")]
    [InlineData("{}", "no_type")]
    [InlineData("{\"type\":\"dance\"}", "unknown_type")]
    public void Bad_lines_are_invalid_not_fatal(string line, string reason)
    {
        Assert.Equal(reason, Assert.IsType<InboundMessage.Invalid>(Protocol.Parse(line)).Reason);
    }

    [Fact]
    public void Parses_stop_and_getReadLog()
    {
        Assert.IsType<InboundMessage.Stop>(Protocol.Parse("{\"type\":\"stop\"}"));
        Assert.IsType<InboundMessage.GetReadLog>(Protocol.Parse("{\"type\":\"getReadLog\"}"));
    }

    [Fact]
    public void Outbound_lines_are_single_line_json()
    {
        foreach (var line in new[]
        {
            Protocol.Ready("0.1.0"), Protocol.Clicked("alpha"), Protocol.Hidden("app_off", "alpha"),
            Protocol.Error("x", "y"), Protocol.Read("alpha", ReadMethod.Ocr, false, 0, "empty"),
        })
        {
            Assert.DoesNotContain('\n', line);
            Assert.StartsWith("{\"type\":", line);
        }
        Assert.Equal("{\"type\":\"ready\",\"platform\":\"windows\",\"protocol\":1,\"version\":\"0.1.0\"}", Protocol.Ready("0.1.0"));
    }
}
