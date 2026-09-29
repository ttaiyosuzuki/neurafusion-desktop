using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Windows.Forms;
using NfOverlay.Core;

namespace NfOverlay.Win;

/// <summary>
/// 右下の丸の窓。常に前面・タスクバーに出さない・押してもフォーカスを奪わない（AI アプリの入力を邪魔しない）。
/// 縁の透けは UpdateLayeredWindow のピクセルごとのアルファで描く。
/// </summary>
internal sealed class BubbleForm : Form
{
    private Rect _bounds;

    public event Action? BubbleClicked;

    public BubbleForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        Text = "NeuraFusion";
        AccessibleName = "NeuraFusion で深掘りする";
        Cursor = Cursors.Hand;
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= Native.WS_EX_LAYERED | Native.WS_EX_TOOLWINDOW | Native.WS_EX_NOACTIVATE | Native.WS_EX_TOPMOST;
            return cp;
        }
    }

    protected override bool ShowWithoutActivation => true;

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Native.WM_MOUSEACTIVATE)
        {
            m.Result = new IntPtr(Native.MA_NOACTIVATE);
            return;
        }
        base.WndProc(ref m);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;
        // 丸の外側の透けた所（光の輪）は押したことにしない。
        var r = Math.Min(Width, Height) / 2.0;
        var dx = e.X - Width / 2.0; var dy = e.Y - Height / 2.0;
        if (dx * dx + dy * dy <= r * r) BubbleClicked?.Invoke();
    }

    /// <summary>丸を置く（物理ピクセル）。大きさが変わったときだけ描き直す。</summary>
    public void Place(Rect bubble)
    {
        var resized = bubble.W != _bounds.W || bubble.H != _bounds.H;
        _bounds = bubble;
        if (!Visible)
        {
            Show();
            resized = true;
        }
        Native.SetWindowPos(Handle, Native.HWND_TOPMOST, bubble.X, bubble.Y, bubble.W, bubble.H,
            Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
        if (resized) Render();
    }

    public void Conceal()
    {
        if (Visible) Hide();
    }

    private void Render()
    {
        using var bmp = LivingMark.Draw(Math.Max(1, _bounds.W));
        var screen = Native.GetDC(IntPtr.Zero);
        var mem = Native.CreateCompatibleDC(screen);
        var hbmp = bmp.GetHbitmap(Color.FromArgb(0));
        var old = Native.SelectObject(mem, hbmp);
        try
        {
            var size = new Native.SIZE { CX = bmp.Width, CY = bmp.Height };
            var src = new Native.POINT();
            var dst = new Native.POINT { X = _bounds.X, Y = _bounds.Y };
            var blend = new Native.BLENDFUNCTION
            {
                BlendOp = Native.AC_SRC_OVER, SourceConstantAlpha = 255, AlphaFormat = Native.AC_SRC_ALPHA,
            };
            Native.UpdateLayeredWindow(Handle, screen, ref dst, ref size, mem, ref src, 0, ref blend, Native.ULW_ALPHA);
        }
        finally
        {
            Native.SelectObject(mem, old);
            Native.DeleteObject(hbmp);
            Native.DeleteDC(mem);
            Native.ReleaseDC(IntPtr.Zero, screen);
        }
    }
}

/// <summary>
/// NeuraFusion の「生きてる丸」（ブラウザ拡張 extension-kensan の makeLivingMark と同じ絵柄・24 の座標系）。
/// 青くつやのある丸・白い縦長の目2つ・外側にうっすら白い光の輪・左上にハイライト。動き（まばたき等）は付けない。
/// </summary>
internal static class LivingMark
{
    private static readonly Color Blue = Color.FromArgb(0x3b, 0x82, 0xf6); // 本体 markColor.ts の既定の青

    private static Color Mix(Color a, Color b, double tb) => Color.FromArgb(
        (int)Math.Round(a.R * (1 - tb) + b.R * tb),
        (int)Math.Round(a.G * (1 - tb) + b.G * tb),
        (int)Math.Round(a.B * (1 - tb) + b.B * tb));

    public static Bitmap Draw(int px)
    {
        var bmp = new Bitmap(px, px, PixelFormat.Format32bppPArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        var k = px / 24f;
        g.ScaleTransform(k, k);

        // 光の輪: 半径 11.6、62%〜100% の間で 0 → 0.45 → 0 の白っぽい青。
        var glow = Mix(Blue, Color.White, 0.75);
        using (var path = new GraphicsPath())
        {
            path.AddEllipse(12 - 11.6f, 12 - 11.6f, 23.2f, 23.2f);
            using var br = new PathGradientBrush(path)
            {
                CenterPoint = new PointF(12, 12),
                InterpolationColors = new ColorBlend
                {
                    // PathGradient の位置は「縁=0 → 中心=1」。
                    Positions = new[] { 0f, 0.22f, 0.38f, 1f },
                    Colors = new[]
                    {
                        Color.FromArgb(0, glow), Color.FromArgb(115, glow), Color.FromArgb(0, glow), Color.FromArgb(0, glow),
                    },
                },
            };
            g.FillPath(br, path);
        }

        // 影
        using (var shadow = new SolidBrush(Color.FromArgb(26, 0, 0, 0)))
            g.FillEllipse(shadow, 12 - 5.4f, 22.4f - 1.1f, 10.8f, 2.2f);

        // 体: 左上寄りに明るい放射グラデーション。
        using (var body = new GraphicsPath())
        {
            body.AddEllipse(3, 3, 18, 18);
            using var br = new PathGradientBrush(body)
            {
                CenterPoint = new PointF(24 * 0.42f, 24 * 0.36f),
                InterpolationColors = new ColorBlend
                {
                    Positions = new[] { 0f, 0.5f, 1f },
                    Colors = new[] { Mix(Blue, Color.Black, 0.4), Blue, Mix(Blue, Color.White, 0.6) },
                },
            };
            g.FillPath(br, body);
        }

        // ハイライト
        var state = g.Save();
        g.TranslateTransform(9, 7.6f);
        g.RotateTransform(-24);
        using (var hi = new SolidBrush(Color.FromArgb(140, 255, 255, 255)))
            g.FillEllipse(hi, -3.4f, -2.2f, 6.8f, 4.4f);
        g.Restore(state);

        // 目（白い縦長の角丸）
        using (var eye = new SolidBrush(Color.White))
            foreach (var x in new[] { 8.1f, 13.3f })
                using (var p = RoundRect(x, 9.9f, 2.6f, 5.2f, 1.3f))
                    g.FillPath(eye, p);

        return bmp;
    }

    private static GraphicsPath RoundRect(float x, float y, float w, float h, float r)
    {
        var p = new GraphicsPath();
        var d = r * 2;
        p.AddArc(x, y, d, d, 180, 90);
        p.AddArc(x + w - d, y, d, d, 270, 90);
        p.AddArc(x + w - d, y + h - d, d, d, 0, 90);
        p.AddArc(x, y + h - d, d, d, 90, 90);
        p.CloseFigure();
        return p;
    }
}
