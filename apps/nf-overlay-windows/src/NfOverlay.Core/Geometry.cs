namespace NfOverlay.Core;

/// <summary>画面上の長方形。Windows の物理ピクセル（Per-Monitor DPI Aware v2）で持つ。</summary>
public readonly record struct Rect(int X, int Y, int W, int H)
{
    public int Right => X + W;
    public int Bottom => Y + H;
    public bool IsEmpty => W <= 0 || H <= 0;

    public bool Intersects(Rect o) =>
        !IsEmpty && !o.IsEmpty && X < o.Right && o.X < Right && Y < o.Bottom && o.Y < Bottom;

    public static Rect FromLtrb(int left, int top, int right, int bottom) =>
        new(left, top, right - left, bottom - top);
}

/// <summary>丸の位置の計算。ウィンドウの右下の内側に置き、画面の作業領域からはみ出さないようにする。</summary>
public static class BubbleLayout
{
    /// <param name="frame">対象ウィンドウの見えている枠（DWMWA_EXTENDED_FRAME_BOUNDS）。</param>
    /// <param name="workArea">そのウィンドウがいるモニターの作業領域（タスクバーを除く）。</param>
    /// <param name="scale">そのモニターの拡大率（DPI / 96）。</param>
    /// <param name="sizeDip">丸の直径（DIP）。</param>
    /// <param name="marginDip">ウィンドウの右端・下端からの余白（DIP）。</param>
    /// <returns>丸の窓の長方形。ウィンドウが小さすぎる・画面外なら null（丸を隠す）。</returns>
    public static Rect? Place(Rect frame, Rect workArea, double scale, int sizeDip, int marginDip)
    {
        if (frame.IsEmpty || workArea.IsEmpty) return null;
        if (scale <= 0 || double.IsNaN(scale)) scale = 1.0;

        var size = Math.Max(1, (int)Math.Round(sizeDip * scale));
        var margin = Math.Max(0, (int)Math.Round(marginDip * scale));

        // 丸と余白が入らない小さなウィンドウには出さない（押せても中身を覆ってしまう）。
        if (frame.W < size + 2 * margin || frame.H < size + 2 * margin) return null;

        var x = frame.Right - margin - size;
        var y = frame.Bottom - margin - size;

        // ウィンドウの右下が画面の外（タスクバーの裏を含む）に出ていたら、見える所まで戻す。
        x = Math.Clamp(x, workArea.X, Math.Max(workArea.X, workArea.Right - size));
        y = Math.Clamp(y, workArea.Y, Math.Max(workArea.Y, workArea.Bottom - size));

        var bubble = new Rect(x, y, size, size);
        // 戻した結果がウィンドウと重ならない（ウィンドウがほぼ画面外）なら出さない。
        return bubble.Intersects(frame) ? bubble : null;
    }
}
