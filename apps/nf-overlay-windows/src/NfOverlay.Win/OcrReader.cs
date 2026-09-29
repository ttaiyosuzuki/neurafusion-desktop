using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using NfOverlay.Core;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;

namespace NfOverlay.Win;

/// <summary>
/// UI Automation で読めないアプリ用: 押されたウィンドウ「だけ」を撮り、端末内の Windows.Media.Ocr で文字にする。
/// 撮った画像はメモリの中だけで使い、ファイルにも標準出力にも出さない。外部へは送らない。
/// 画面全体は撮らない（PrintWindow は重なっている他のウィンドウを含まない）。
/// </summary>
internal sealed class OcrReader : IAnswerReader
{
    public ReadMethod Method => ReadMethod.Ocr;

    public async Task<string?> ReadAsync(long window, CancellationToken ct)
    {
        var engine = CreateEngine();
        if (engine is null) return null;

        using var software = await Task.Run(() => Capture(new IntPtr(window), (int)OcrEngine.MaxImageDimension), ct)
            .ConfigureAwait(false);
        if (software is null) return null;
        ct.ThrowIfCancellationRequested();

        var result = await engine.RecognizeAsync(software).AsTask(ct).ConfigureAwait(false);
        var sb = new StringBuilder();
        foreach (var line in result.Lines) sb.AppendLine(line.Text);
        var text = sb.ToString().Trim();
        return text.Length <= UiaReader.MaxChars ? text : text[^UiaReader.MaxChars..];
    }

    /// <summary>本人の表示言語の OCR。入っていなければ日本語→英語の順に試す。</summary>
    private static OcrEngine? CreateEngine()
    {
        var e = OcrEngine.TryCreateFromUserProfileLanguages();
        if (e is not null) return e;
        foreach (var tag in new[] { "ja", "en-US" })
        {
            var lang = new Language(tag);
            if (OcrEngine.IsLanguageSupported(lang)) return OcrEngine.TryCreateFromLanguage(lang);
        }
        return null;
    }

    /// <summary>そのウィンドウだけを撮って、OCR が受け取れる大きさの SoftwareBitmap にする。</summary>
    private static SoftwareBitmap? Capture(IntPtr hwnd, int maxDim)
    {
        if (!Native.GetWindowRect(hwnd, out var r)) return null;
        int w = r.Right - r.Left, h = r.Bottom - r.Top;
        if (w <= 0 || h <= 0) return null;

        using var shot = new Bitmap(w, h, PixelFormat.Format32bppPArgb);
        using (var g = Graphics.FromImage(shot))
        {
            var hdc = g.GetHdc();
            try
            {
                // PW_RENDERFULLCONTENT: Chromium・Electron 等の GPU 描画のウィンドウも撮れる（Windows 8.1 以降）。
                if (!Native.PrintWindow(hwnd, hdc, Native.PW_RENDERFULLCONTENT)) return null;
            }
            finally { g.ReleaseHdc(hdc); }
        }

        // OCR の上限（MaxImageDimension）を超えるときは縮める。
        var scale = Math.Min(1.0, (double)maxDim / Math.Max(w, h));
        using var sized = scale < 1.0 ? Resize(shot, (int)(w * scale), (int)(h * scale)) : (Bitmap)shot.Clone();
        return ToSoftwareBitmap(sized);
    }

    private static Bitmap Resize(Bitmap src, int w, int h)
    {
        var dst = new Bitmap(Math.Max(1, w), Math.Max(1, h), PixelFormat.Format32bppPArgb);
        using var g = Graphics.FromImage(dst);
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        g.DrawImage(src, 0, 0, dst.Width, dst.Height);
        return dst;
    }

    private static SoftwareBitmap ToSoftwareBitmap(Bitmap bmp)
    {
        var rect = new System.Drawing.Rectangle(0, 0, bmp.Width, bmp.Height);
        var data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppPArgb);
        try
        {
            var row = bmp.Width * 4;
            var bytes = new byte[row * bmp.Height];
            for (var y = 0; y < bmp.Height; y++)
                Marshal.Copy(data.Scan0 + y * data.Stride, bytes, y * row, row);
            return SoftwareBitmap.CreateCopyFromBuffer(bytes.AsBuffer(), BitmapPixelFormat.Bgra8,
                bmp.Width, bmp.Height, BitmapAlphaMode.Premultiplied);
        }
        finally { bmp.UnlockBits(data); }
    }
}
