using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Windows.Forms;
using NfOverlay.Core;

namespace NfOverlay.Win;

/// <summary>
/// FF 先読みの半透明の行の窓。主画面の作業領域の下寄り中央に出す。
/// 常に前面・フォーカスを奪わない（WS_EX_NOACTIVATE・ShowWithoutActivation）・タスクバーに出さない・マウスは素通し
/// （WS_EX_TRANSPARENT・HTTRANSPARENT）。半透明は ff-config の opacity（層つき窓の全体のアルファ）。
/// 画面共有・録画から隠す API は使わない（FF-07。見えている物は共有にもそのまま映る）。
/// </summary>
internal sealed class FfStripForm : Form
{
    private static readonly Color Back = Color.FromArgb(0x11, 0x18, 0x27);
    private static readonly Color Fore = Color.White;
    private static readonly Color Dim = Color.FromArgb(0xCB, 0xD5, 0xE1);
    private const TextFormatFlags Flags = TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine
        | TextFormatFlags.EndEllipsis | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding;

    private readonly Font _font = new("Yu Gothic UI", 11f, FontStyle.Regular, GraphicsUnit.Point);
    private FfLine[] _lines = Array.Empty<FfLine>();
    private int _lineH;
    private int _padX;
    private int _padY;

    /// <summary>行を描き終えた（描いた行・描き終えた瞬間の Stopwatch のタイムスタンプ）。ff-drawn はここから出す。</summary>
    public event Action<FfLine[], long>? LinesPainted;

    public FfStripForm()
    {
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        TopMost = true;
        Text = "NeuraFusion FF";
        AccessibleName = "NeuraFusion 先読み";
        BackColor = Back;
        // 1 未満にしておく（層つき窓の全体のアルファが必ず設定される）。
        Opacity = FfConfig.DefaultOpacity;
        SetStyle(ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.UserPaint, true);
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= Native.WS_EX_NOACTIVATE | Native.WS_EX_TOPMOST | Native.WS_EX_TOOLWINDOW
                | Native.WS_EX_TRANSPARENT | Native.WS_EX_LAYERED;
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
        if (m.Msg == Native.WM_NCHITTEST)
        {
            m.Result = new IntPtr(Native.HTTRANSPARENT);
            return;
        }
        base.WndProc(ref m);
    }

    public void SetOpacity(double opacity) =>
        Opacity = Math.Clamp(opacity, FfConfig.MinOpacity, FfConfig.MaxOpacity);

    /// <summary>行を出す（窓が出ていなければ出す）。その場で描き切る（Update）ので、戻る前に LinesPainted が来る。</summary>
    public void ShowLines(System.Collections.Generic.IReadOnlyList<FfLine> lines)
    {
        _lines = lines.ToArray();
        var s = DeviceDpi / 96f;
        _padX = (int)Math.Round(16 * s);
        _padY = (int)Math.Round(10 * s);
        _lineH = _font.Height + (int)Math.Round(6 * s);

        var wa = Screen.PrimaryScreen?.WorkingArea ?? SystemInformation.WorkingArea;
        var textW = 0;
        foreach (var line in _lines)
            textW = Math.Max(textW, TextRenderer.MeasureText(line.Text, _font, Size.Empty, Flags).Width);
        var minW = (int)Math.Round(280 * s);
        var maxW = Math.Max(minW, (int)(wa.Width * 0.7));
        var w = Math.Clamp(textW + _padX * 2, minW, maxW);
        var h = Math.Max(1, _lines.Length) * _lineH + _padY * 2;
        var x = wa.Left + (wa.Width - w) / 2;
        var y = wa.Bottom - h - (int)Math.Round(56 * s);

        var resized = w != Width || h != Height;
        Bounds = new Rectangle(x, y, w, h);
        if (!Visible) Show();
        Native.SetWindowPos(Handle, Native.HWND_TOPMOST, x, y, w, h, Native.SWP_NOACTIVATE | Native.SWP_SHOWWINDOW);
        if (resized) SetRoundRegion(w, h, (int)Math.Round(10 * s));
        Invalidate();
        Update();
    }

    public void Conceal()
    {
        _lines = Array.Empty<FfLine>();
        if (Visible) Hide();
    }

    protected override void OnPaintBackground(PaintEventArgs e)
    {
        // 背景も OnPaint で塗る（ちらつかせない）。
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.Clear(Back);
        var y = _padY;
        foreach (var line in _lines)
        {
            var color = line.Kind == FfLineKind.Move ? Fore : Dim;
            TextRenderer.DrawText(g, line.Text, _font, new Rectangle(_padX, y, ClientSize.Width - _padX * 2, _lineH), color, Flags);
            y += _lineH;
        }
        base.OnPaint(e);
        if (_lines.Length > 0) LinesPainted?.Invoke(_lines, Stopwatch.GetTimestamp());
    }

    private void SetRoundRegion(int w, int h, int r)
    {
        using var path = new GraphicsPath();
        var d = r * 2;
        path.AddArc(0, 0, d, d, 180, 90);
        path.AddArc(w - d, 0, d, d, 270, 90);
        path.AddArc(w - d, h - d, d, d, 0, 90);
        path.AddArc(0, h - d, d, d, 90, 90);
        path.CloseFigure();
        var old = Region;
        Region = new Region(path);
        old?.Dispose();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _font.Dispose();
        base.Dispose(disposing);
    }
}
