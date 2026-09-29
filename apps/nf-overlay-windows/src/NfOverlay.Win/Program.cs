using System;
using System.Text;
using System.Windows.Forms;

namespace NfOverlay.Win;

internal static class Program
{
    /// <summary>
    /// Node の CLI から起動される（標準入出力を JSON 1行ずつでやり取りする）。config が来るまで何も見ず、
    /// 丸も出さない。標準入力がつながっていない（単独で起動した）ときは、読むものが無いのですぐ終わる。
    /// </summary>
    [STAThread]
    private static int Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);
        ApplicationConfiguration.Initialize();
        Application.Run(new OverlayHost());
        return 0;
    }
}
