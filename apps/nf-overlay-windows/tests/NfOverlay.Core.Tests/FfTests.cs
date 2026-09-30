using System.Text.Json;
using NfOverlay.Core;
using Xunit;

namespace NfOverlay.Core.Tests;

/// <summary>FF 先読み（docs/overlay-protocol.md「FF 先読み」）の読み書き・キーの対応表・行の窓の状態。</summary>
public class FfTests
{
    private const string ConfigLine =
        "{\"v\":1,\"type\":\"ff-config\",\"enabled\":true," +
        "\"keys\":{\"trigger\":{\"mods\":[\"shift\",\"alt\"],\"key\":\",\"},\"adopt\":{\"mods\":[\"alt\",\"shift\"],\"key\":\".\"},\"close\":{\"mods\":[],\"key\":\"escape\"}}," +
        "\"scopes\":{\"trigger\":\"global\",\"adopt\":\"overlay-only\",\"close\":\"overlay-only\"}," +
        "\"labels\":{\"trigger\":\"Option+Shift+,\",\"adopt\":\"Option+Shift+.\",\"close\":\"Escape\"},\"opacity\":0.72}";

    // ---- 読む ----

    [Fact]
    public void Parses_ff_config_shape()
    {
        var cfg = Assert.IsType<InboundMessage.FfConfigMsg>(Protocol.Parse(ConfigLine)).Value;
        Assert.True(cfg.Enabled);
        Assert.Equal(0.72, cfg.Opacity, 3);
        Assert.Equal(new[] { "alt", "shift" }, cfg.Keys[FfAction.Trigger].Mods); // 並びは ctrl・alt・shift・meta に揃える
        Assert.Equal(",", cfg.Keys[FfAction.Trigger].Key);
        Assert.Equal(".", cfg.Keys[FfAction.Adopt].Key);
        Assert.Empty(cfg.Keys[FfAction.Close].Mods);
        Assert.Equal("escape", cfg.Keys[FfAction.Close].Key);
        Assert.Equal("Option+Shift+.", cfg.Labels[FfAction.Adopt]);
        Assert.Equal(FfScope.Global, cfg.ScopeOf(FfAction.Trigger));
        Assert.Equal(FfScope.OverlayOnly, cfg.ScopeOf(FfAction.Adopt));
        Assert.Equal(FfScope.OverlayOnly, cfg.ScopeOf(FfAction.Close));
    }

    [Fact]
    public void Scopes_default_to_trigger_global_only_and_can_be_overridden()
    {
        var none = Assert.IsType<InboundMessage.FfConfigMsg>(Protocol.Parse("{\"type\":\"ff-config\"}")).Value;
        Assert.Equal(FfScope.Global, none.ScopeOf(FfAction.Trigger));
        Assert.Equal(FfScope.OverlayOnly, none.ScopeOf(FfAction.Adopt));
        Assert.Equal(FfScope.OverlayOnly, none.ScopeOf(FfAction.Close));

        var custom = Assert.IsType<InboundMessage.FfConfigMsg>(Protocol.Parse(
            "{\"type\":\"ff-config\",\"scopes\":{\"trigger\":\"overlay-only\",\"adopt\":\"global\",\"close\":\"sometimes\"}}")).Value;
        Assert.Equal(FfScope.OverlayOnly, custom.ScopeOf(FfAction.Trigger));
        Assert.Equal(FfScope.Global, custom.ScopeOf(FfAction.Adopt));
        Assert.Equal(FfScope.OverlayOnly, custom.ScopeOf(FfAction.Close)); // 知らない値は既定
    }

    [Fact]
    public void Ff_config_clamps_opacity_and_skips_missing_keys()
    {
        var cfg = Assert.IsType<InboundMessage.FfConfigMsg>(Protocol.Parse(
            "{\"v\":1,\"type\":\"ff-config\",\"enabled\":false,\"keys\":{\"trigger\":{\"mods\":[\"ctrl\",\"hyper\"],\"key\":\"K\"},\"adopt\":{\"mods\":[]}},\"opacity\":5}")).Value;
        Assert.False(cfg.Enabled);
        Assert.Equal(FfConfig.MaxOpacity, cfg.Opacity);
        Assert.Equal(new[] { "ctrl" }, cfg.Keys[FfAction.Trigger].Mods); // 知らない修飾は捨てる
        Assert.Equal("k", cfg.Keys[FfAction.Trigger].Key);
        Assert.False(cfg.Keys.ContainsKey(FfAction.Adopt)); // key の無いものは登録しない
        Assert.False(cfg.Keys.ContainsKey(FfAction.Close));

        var low = Assert.IsType<InboundMessage.FfConfigMsg>(Protocol.Parse("{\"type\":\"ff-config\",\"opacity\":0}")).Value;
        Assert.Equal(FfConfig.MinOpacity, low.Opacity);
        Assert.True(low.Enabled);
        var none = Assert.IsType<InboundMessage.FfConfigMsg>(Protocol.Parse("{\"type\":\"ff-config\"}")).Value;
        Assert.Equal(FfConfig.DefaultOpacity, none.Opacity);
    }

    [Fact]
    public void Parses_ff_line_and_hide()
    {
        var line = Assert.IsType<InboundMessage.FfLineMsg>(Protocol.Parse(
            "{\"v\":1,\"type\":\"ff-line\",\"press\":3,\"seq\":0,\"kind\":\"move\",\"text\":\"1  型エラーを直す  N=12\",\"n\":12}")).Value;
        Assert.Equal(new FfLine(3, 0, FfLineKind.Move, "1  型エラーを直す  N=12", 12, false), line);

        var reset = Assert.IsType<InboundMessage.FfLineMsg>(Protocol.Parse(
            "{\"v\":1,\"type\":\"ff-line\",\"press\":4,\"seq\":2,\"kind\":\"none\",\"text\":\"記録なし\",\"reset\":true}")).Value;
        Assert.Equal((FfLineKind.None, true, (int?)null), (reset.Kind, reset.Reset, reset.N));

        var info = Assert.IsType<InboundMessage.FfLineMsg>(Protocol.Parse(
            "{\"type\":\"ff-line\",\"press\":1,\"kind\":\"sparkle\",\"text\":\"x\"}")).Value;
        Assert.Equal((FfLineKind.Info, 0), (info.Kind, info.Seq));

        Assert.IsType<InboundMessage.FfHide>(Protocol.Parse("{\"v\":1,\"type\":\"ff-hide\"}"));
    }

    [Fact]
    public void Ff_line_without_press_or_text_is_malformed_and_long_text_is_cut()
    {
        Assert.Equal("no-press", Assert.IsType<InboundMessage.Malformed>(
            Protocol.Parse("{\"type\":\"ff-line\",\"text\":\"x\"}")).Reason);
        Assert.Equal("no-text", Assert.IsType<InboundMessage.Malformed>(
            Protocol.Parse("{\"type\":\"ff-line\",\"press\":1}")).Reason);
        var longText = new string('あ', Protocol.FfMaxTextChars + 50);
        var cut = Assert.IsType<InboundMessage.FfLineMsg>(
            Protocol.Parse("{\"type\":\"ff-line\",\"press\":1,\"text\":\"" + longText + "\"}")).Value;
        Assert.Equal(Protocol.FfMaxTextChars, cut.Text.Length);
    }

    [Fact]
    public void Unknown_ff_types_are_still_skipped()
    {
        Assert.Equal("ff-future", Assert.IsType<InboundMessage.Unknown>(
            Protocol.Parse("{\"v\":1,\"type\":\"ff-future\",\"x\":1}")).Type);
    }

    // ---- 書く ----

    [Fact]
    public void Encodes_ff_key()
    {
        Assert.Equal("{\"v\":1,\"type\":\"ff-key\",\"action\":\"trigger\",\"press\":3}", Protocol.FfKey(FfAction.Trigger, 3));
        Assert.Equal("{\"v\":1,\"type\":\"ff-key\",\"action\":\"close\",\"press\":7}", Protocol.FfKey(FfAction.Close, 7));
    }

    [Fact]
    public void Encodes_ff_drawn_rounded_to_tenth_ms()
    {
        Assert.Equal("{\"v\":1,\"type\":\"ff-drawn\",\"press\":3,\"seq\":0,\"ms\":41.7}", Protocol.FfDrawn(3, 0, 41.6666));
        using var doc = JsonDocument.Parse(Protocol.FfDrawn(new FfDrawnReport(2, 1, -3)));
        Assert.Equal(0, doc.RootElement.GetProperty("ms").GetDouble());
    }

    [Fact]
    public void Encodes_ff_keys()
    {
        Assert.Equal("{\"v\":1,\"type\":\"ff-keys\",\"ok\":true,\"failed\":[]}", Protocol.FfKeys(Array.Empty<FfAction>()));
        Assert.Equal("{\"v\":1,\"type\":\"ff-keys\",\"ok\":false,\"failed\":[\"trigger\",\"adopt\"]}",
            Protocol.FfKeys(new[] { FfAction.Adopt, FfAction.Trigger, FfAction.Adopt }));
    }

    // ---- キーの対応表 ----

    [Theory]
    [InlineData(".", 0xBE)]
    [InlineData(",", 0xBC)]
    [InlineData("a", 0x41)]
    [InlineData("z", 0x5A)]
    [InlineData("0", 0x30)]
    [InlineData("9", 0x39)]
    [InlineData("/", 0xBF)]
    [InlineData(";", 0xBA)]
    [InlineData("'", 0xDE)]
    [InlineData("[", 0xDB)]
    [InlineData("]", 0xDD)]
    [InlineData("-", 0xBD)]
    [InlineData("=", 0xBB)]
    [InlineData("`", 0xC0)]
    [InlineData("escape", 0x1B)]
    [InlineData("space", 0x20)]
    [InlineData("f1", 0x70)]
    [InlineData("f12", 0x7B)]
    [InlineData("f24", 0x87)]
    public void Maps_keys_to_virtual_keys(string key, int vk)
    {
        Assert.Equal((uint)vk, FfHotkey.VirtualKey(key));
    }

    [Theory]
    [InlineData("f0")]
    [InlineData("f25")]
    [InlineData("f01")]
    [InlineData("enter")]
    [InlineData("!")]
    [InlineData("")]
    public void Unknown_keys_do_not_map(string key)
    {
        Assert.Null(FfHotkey.VirtualKey(key));
        Assert.Null(FfHotkey.Map(new FfChord(new[] { "alt" }, key)));
    }

    [Fact]
    public void Maps_mods_with_norepeat()
    {
        var hk = FfHotkey.Map(new FfChord(new[] { "alt", "shift" }, "."));
        Assert.Equal(new Win32Hotkey(0x0001 | 0x0004 | 0x4000, 0xBE), hk);
        Assert.Equal(new Win32Hotkey(0x0002 | 0x0008 | 0x4000, 0x4B), FfHotkey.Map(new FfChord(new[] { "ctrl", "meta" }, "k")));
        Assert.Equal(new Win32Hotkey(0x4000, 0x1B), FfHotkey.Map(new FfChord(Array.Empty<string>(), "escape")));
        Assert.Null(FfHotkey.Map(new FfChord(new[] { "hyper" }, "k")));
    }

    [Fact]
    public void Default_config_keys_map()
    {
        var cfg = Assert.IsType<InboundMessage.FfConfigMsg>(Protocol.Parse(ConfigLine)).Value;
        Assert.All(cfg.Keys.Values, c => Assert.NotNull(FfHotkey.Map(c)));
    }

    // ---- 行の窓の状態 ----

    private static FfLine L(int press, int seq, bool reset = false) => new(press, seq, FfLineKind.Move, $"{press}-{seq}", null, reset);

    [Fact]
    public void Strip_is_off_until_ff_config()
    {
        var s = new FfStrip();
        Assert.False(s.OnLine(L(1, 0)));
        Assert.False(s.Visible);
        Assert.False(s.WantsClose);
    }

    [Fact]
    public void Presses_count_up_from_one()
    {
        var s = new FfStrip();
        s.Configure(true);
        Assert.Equal(1, s.OnKey(100));
        Assert.Equal(2, s.OnKey(200));
        Assert.Equal(2, s.Press);
    }

    [Fact]
    public void Drawn_is_reported_once_per_press_with_ms_from_key()
    {
        var s = new FfStrip();
        s.Configure(true);
        var p = s.OnKey(1_000);
        s.OnLine(L(p, 0));
        var first = s.OnPainted(s.Lines, 1_000 + 4_170, 100_000); // 100 kHz の時計で 4170 刻み = 41.7 ms
        var r = Assert.Single(first);
        Assert.Equal((p, 0), (r.Press, r.Seq));
        Assert.Equal(41.7, r.Ms, 6);

        s.OnLine(L(p, 1));
        Assert.Empty(s.OnPainted(s.Lines, 9_000, 100_000)); // 同じ押下の2行目・描き直しでは出さない
        Assert.Empty(s.OnPainted(s.Lines, 9_500, 100_000));

        var q = s.OnKey(10_000);
        s.OnLine(L(q, 0, reset: true));
        Assert.Equal(q, Assert.Single(s.OnPainted(s.Lines, 10_500, 100_000)).Press);
    }

    [Fact]
    public void Lines_of_unknown_press_are_drawn_but_not_reported()
    {
        var s = new FfStrip();
        s.Configure(true);
        Assert.True(s.OnLine(L(99, 0)));
        Assert.Empty(s.OnPainted(s.Lines, 1, 1_000));
    }

    [Fact]
    public void Reset_clears_previous_lines()
    {
        var s = new FfStrip();
        s.Configure(true);
        s.OnLine(L(1, 0));
        s.OnLine(L(1, 1));
        Assert.Equal(2, s.Lines.Count);
        s.OnLine(L(1, 2, reset: true));
        Assert.Equal(new[] { "1-2" }, s.Lines.Select(l => l.Text));
    }

    [Fact]
    public void Lines_are_capped()
    {
        var s = new FfStrip();
        s.Configure(true);
        for (var i = 0; i < FfStrip.MaxLines + 3; i++) s.OnLine(L(1, i));
        Assert.Equal(FfStrip.MaxLines, s.Lines.Count);
        Assert.Equal(3, s.Lines[0].Seq); // 古い方から消す
    }

    [Fact]
    public void Close_is_wanted_only_while_visible()
    {
        var s = new FfStrip();
        s.Configure(true);
        Assert.False(s.WantsClose);
        s.OnLine(L(s.OnKey(0), 0));
        Assert.True(s.Visible);
        Assert.True(s.WantsClose);
        s.Hide();
        Assert.False(s.Visible);
        Assert.Empty(s.Lines);
        Assert.False(s.WantsClose);
    }

    [Fact]
    public void Default_scopes_register_trigger_always_and_adopt_close_only_while_visible()
    {
        var s = new FfStrip();
        Assert.False(s.Wants(FfAction.Trigger)); // ff-config 前は何も登録しない
        s.Configure(Assert.IsType<InboundMessage.FfConfigMsg>(Protocol.Parse(ConfigLine)).Value);
        Assert.True(s.Wants(FfAction.Trigger));
        Assert.False(s.Wants(FfAction.Adopt));
        Assert.False(s.Wants(FfAction.Close));
        s.OnLine(L(s.OnKey(0), 0));
        Assert.True(s.Wants(FfAction.Trigger));
        Assert.True(s.Wants(FfAction.Adopt));
        Assert.True(s.Wants(FfAction.Close));
        s.Hide();
        Assert.True(s.Wants(FfAction.Trigger));
        Assert.False(s.Wants(FfAction.Adopt));
        Assert.False(s.Wants(FfAction.Close));
    }

    [Fact]
    public void Custom_scopes_are_honored()
    {
        var s = new FfStrip();
        s.Configure(true, new Dictionary<FfAction, FfScope> { [FfAction.Trigger] = FfScope.OverlayOnly, [FfAction.Adopt] = FfScope.Global });
        Assert.False(s.Wants(FfAction.Trigger));
        Assert.True(s.Wants(FfAction.Adopt));
        Assert.False(s.Wants(FfAction.Close)); // 書いていない役目は既定（表示中だけ）
    }

    [Fact]
    public void Disabling_hides_and_releases_close()
    {
        var s = new FfStrip();
        s.Configure(true);
        s.OnLine(L(1, 0));
        s.Configure(false);
        Assert.False(s.Visible);
        Assert.False(s.WantsClose);
        Assert.False(s.Wants(FfAction.Trigger)); // オフなら全体キーも外す
        Assert.False(s.OnLine(L(1, 1)));
    }
}
