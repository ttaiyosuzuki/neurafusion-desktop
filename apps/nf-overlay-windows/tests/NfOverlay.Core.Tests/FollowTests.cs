using NfOverlay.Core;
using Xunit;
using static NfOverlay.Core.Tests.Fixtures;

namespace NfOverlay.Core.Tests;

/// <summary>TS-38（Windows 分）: ウィンドウの移動・大きさの変更に丸がついていく。オン・オフが効く。</summary>
public class FollowTests
{
    [Fact]
    public void Bubble_sits_inside_bottom_right_corner()
    {
        var b = BubbleLayout.Place(new Rect(100, 100, 800, 600), Screen, 1.0, 44, 16);
        Assert.Equal(new Rect(900 - 16 - 44, 700 - 16 - 44, 44, 44), b);
    }

    [Fact]
    public void Bubble_scales_with_monitor_dpi()
    {
        var b = BubbleLayout.Place(new Rect(0, 0, 1000, 800), new Rect(0, 0, 2880, 1800), 1.5, 44, 16);
        Assert.Equal(new Rect(1000 - 24 - 66, 800 - 24 - 66, 66, 66), b);
    }

    [Fact]
    public void Bubble_is_pulled_back_on_screen_when_window_runs_off_the_edge()
    {
        // ウィンドウの右下がタスクバーの裏・画面の右外に出ている。
        var b = BubbleLayout.Place(new Rect(1500, 700, 800, 600), Screen, 1.0, 44, 16);
        Assert.Equal(new Rect(1920 - 44, 1040 - 44, 44, 44), b);
    }

    [Fact]
    public void Bubble_is_hidden_for_tiny_or_offscreen_windows()
    {
        Assert.Null(BubbleLayout.Place(new Rect(0, 0, 60, 60), Screen, 1.0, 44, 16));
        Assert.Null(BubbleLayout.Place(new Rect(3000, 0, 800, 600), Screen, 1.0, 44, 16));
        Assert.Null(BubbleLayout.Place(new Rect(0, 0, 0, 0), Screen, 1.0, 44, 16));
    }

    [Fact]
    public void Bubble_follows_move_and_resize()
    {
        var t = new FollowTracker(Config());
        var first = Assert.IsType<FollowUpdate.Show>(t.Update(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600))));
        Assert.Equal("alpha", first.App);

        var moved = Assert.IsType<FollowUpdate.Show>(t.OnMoved(Win(7, "alpha-ai.exe", new Rect(300, 150, 800, 600))));
        Assert.Equal(first.Bubble.X + 200, moved.Bubble.X);
        Assert.Equal(first.Bubble.Y + 50, moved.Bubble.Y);

        var resized = Assert.IsType<FollowUpdate.Show>(t.OnMoved(Win(7, "alpha-ai.exe", new Rect(300, 150, 1000, 700))));
        Assert.Equal(300 + 1000 - 16 - 44, resized.Bubble.X);
        Assert.Equal(150 + 700 - 16 - 44, resized.Bubble.Y);
    }

    [Fact]
    public void Same_shape_twice_emits_nothing()
    {
        var t = new FollowTracker(Config());
        var w = Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600));
        Assert.NotNull(t.Update(w));
        Assert.Null(t.Update(w));
        Assert.Null(t.OnMoved(w));
    }

    [Fact]
    public void Moves_of_other_windows_are_ignored()
    {
        var t = new FollowTracker(Config());
        t.Update(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600)));
        Assert.Null(t.OnMoved(Win(8, "alpha-ai.exe", new Rect(0, 0, 500, 500))));
        Assert.Null(t.OnMoved(Win(9, "notepad.exe", new Rect(0, 0, 500, 500))));
    }

    [Fact]
    public void Non_registered_app_hides_bubble()
    {
        var t = new FollowTracker(Config());
        t.Update(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600)));
        var h = Assert.IsType<FollowUpdate.Hide>(t.Update(Win(9, @"C:\Windows\notepad.exe", new Rect(0, 0, 800, 600))));
        Assert.Equal("not_target", h.Reason);
        Assert.Equal(0, t.Tracked);
    }

    [Fact]
    public void Exe_matching_ignores_case_path_and_extension()
    {
        var m = new AppMatcher(Config());
        Assert.Equal("beta", m.Find(@"C:\Users\x\AppData\Local\Programs\beta\BETA.EXE")?.Id);
        Assert.Equal("beta", m.Find("beta-canary")?.Id);
        Assert.Null(m.Find("alpha-ai-helper.exe"));
    }

    [Fact]
    public void Per_app_off_hides_only_that_app()
    {
        var t = new FollowTracker(Config(alphaOn: false));
        var h = Assert.IsType<FollowUpdate.Hide>(t.Update(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600))));
        Assert.Equal("app_off", h.Reason);
        Assert.IsType<FollowUpdate.Show>(t.Update(Win(8, "beta.exe", new Rect(100, 100, 800, 600))));
    }

    [Fact]
    public void Global_off_hides_everything()
    {
        var t = new FollowTracker(Config(enabled: false));
        var h = Assert.IsType<FollowUpdate.Hide>(t.Update(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600))));
        Assert.Equal("off", h.Reason);
    }

    [Fact]
    public void Turning_an_app_off_while_shown_hides_the_bubble()
    {
        var t = new FollowTracker(Config());
        var w = Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600));
        Assert.IsType<FollowUpdate.Show>(t.Update(w));
        var h = Assert.IsType<FollowUpdate.Hide>(t.Reconfigure(Config(alphaOn: false), w));
        Assert.Equal("app_off", h.Reason);
        Assert.IsType<FollowUpdate.Show>(t.Reconfigure(Config(), w));
    }

    [Fact]
    public void Minimize_hides_and_restore_shows_again()
    {
        var t = new FollowTracker(Config());
        t.Update(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600)));
        var h = Assert.IsType<FollowUpdate.Hide>(t.OnMoved(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600), minimized: true)));
        Assert.Equal("minimized", h.Reason);
        Assert.Equal(7, t.Tracked);
        Assert.IsType<FollowUpdate.Show>(t.OnMoved(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600))));
    }

    [Fact]
    public void Own_bubble_or_panel_in_front_keeps_the_target()
    {
        var t = new FollowTracker(Config());
        t.Update(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600)));
        Assert.Null(t.Update(Win(99, "nf-overlay.exe", new Rect(0, 0, 400, 600), own: true)));
        Assert.Equal(7, t.Current?.Window);
    }

    [Fact]
    public void Geometry_line_has_frame_and_bubble()
    {
        var t = new FollowTracker(Config());
        var s = Assert.IsType<FollowUpdate.Show>(t.Update(Win(7, "alpha-ai.exe", new Rect(100, 100, 800, 600))));
        Assert.Equal(
            "{\"type\":\"geometry\",\"app\":\"alpha\",\"frame\":{\"x\":100,\"y\":100,\"w\":800,\"h\":600}," +
            "\"bubble\":{\"x\":840,\"y\":640,\"w\":44,\"h\":44},\"scale\":1}",
            s.ToLine());
    }
}
