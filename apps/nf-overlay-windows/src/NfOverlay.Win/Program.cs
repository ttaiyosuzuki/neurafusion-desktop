using System;
using System.Text;
using System.Windows.Forms;

namespace NfOverlay.Win;

internal static class Program
{
    /// <summary>
    /// Node の CLI から起動される（標準入出力を JSON 1行ずつでやり取りする）。単独で起動しても、
    /// config が来るまで丸は出さない。
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
