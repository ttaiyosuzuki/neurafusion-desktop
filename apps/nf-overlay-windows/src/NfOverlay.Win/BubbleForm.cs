using System;
using System.Linq;
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
/// NF の丸（2026-10-02 見た目③ icon-apps-main・原画 neurafusion-repo design/icon-gradient/nf-mark-gradient.svg）:
/// 左下 黄 → 右上 紫の4色・中心が濃く外へ白・白ふち・白い縦長の目2つ・外側にうっすら光の輪。動き（まばたき等）は付けない。
/// 以前の青い球・ハイライト・影はやめた。色は Web の LivingMark の COMPLETE_STOPS（hsl）を sRGB にした値。
/// </summary>
internal static class LivingMark
{
    // hsl(45 97% 54%)・hsl(24 97% 54%)・hsl(335 90% 57%)・hsl(275 80% 56%)
    private static readonly float[] StopPos = { 0f, 0.36f, 0.68f, 1f };
    private static readonly Color[] StopColors =
    {
        Color.FromArgb(0xfb, 0xc3, 0x18), Color.FromArgb(0xfb, 0x73, 0x18), Color.FromArgb(0xf4, 0x2f, 0x81), Color.FromArgb(0x9e, 0x35, 0xe9),
    };
    private static readonly Color Halo = Color.FromArgb(0xf4, 0x2f, 0x81); // 桃＝Web の COMPLETE_HALO

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

        // 光の輪: 半径 11.6、62%〜100% の間で 0 → 0.45 → 0 の白っぽい桃。
        var glow = Mix(Halo, Color.White, 0.75);
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

        using (var body = new GraphicsPath())
        {
            body.AddEllipse(3, 3, 18, 18);
            var clip = g.Save();
            g.SetClip(body);

            // 本体: 左下 黄 → 右上 紫。原画の線（objectBoundingBox 0.18,0.82 → 0.82,0.18）を丸の外まで伸ばし、
            // 端の色をそのまま延ばす（GDI+ の線形は繰り返すので、端に同じ色の止まりを足す）。
            const float half = 18 * 0.64f * 0.70710678f; // 中心から原画の線の端まで（≒8.15）
            const float ext = 9.5f; // 丸（半径 9）より外まで
            var pos = new float[StopPos.Length + 2];
            var cols = new Color[StopColors.Length + 2];
            pos[0] = 0f; cols[0] = StopColors[0];
            for (var i = 0; i < StopPos.Length; i++)
            {
                pos[i + 1] = (ext - half + StopPos[i] * 2 * half) / (2 * ext);
                cols[i + 1] = StopColors[i];
            }
            pos[^1] = 1f; cols[^1] = StopColors[^1];
            var d = ext * 0.70710678f;
            using (var lin = new LinearGradientBrush(new PointF(12 - d, 12 + d), new PointF(12 + d, 12 - d), StopColors[0], StopColors[^1])
            {
                InterpolationColors = new ColorBlend { Positions = pos, Colors = cols },
            })
                g.FillPath(lin, body);

            // 白の重ね: 中心 (12, 10.92)・半径 10.08 で、中心が濃く外へ白（丸はこの円の中に収まる）。位置は「縁=0 → 中心=1」。
            using (var wp = new GraphicsPath())
            {
                wp.AddEllipse(12 - 10.08f, 10.92f - 10.08f, 20.16f, 20.16f);
                using var wb = new PathGradientBrush(wp)
                {
                    CenterPoint = new PointF(12, 10.92f),
                    InterpolationColors = new ColorBlend
                    {
                        Positions = new[] { 0f, 0.15f, 0.25f, 0.35f, 0.45f, 0.6f, 0.8f, 1f },
                        Colors = new[] { 115, 94, 69, 48, 38, 26, 10, 0 }.Select(a => Color.FromArgb(a, 255, 255, 255)).ToArray(),
                    },
                };
                g.FillPath(wb, wp);
            }

            // 白ふち（93%〜100% だけ白）
            using (var rb = new PathGradientBrush(body)
            {
                CenterPoint = new PointF(12, 12),
                InterpolationColors = new ColorBlend
                {
                    Positions = new[] { 0f, 0.03f, 0.07f, 1f },
                    Colors = new[] { Color.FromArgb(217, 255, 255, 255), Color.FromArgb(107, 255, 255, 255), Color.FromArgb(0, 255, 255, 255), Color.FromArgb(0, 255, 255, 255) },
                },
            })
                g.FillPath(rb, body);

            g.Restore(clip);
        }

        // 目（白い縦長の角丸）
        using (var eye = new SolidBrush(Color.White))
            foreach (var x in new[] { 8.37f, 13.66f })
                using (var p = RoundRect(x, 7.98f, 1.97f, 3.7f, 0.985f))
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
