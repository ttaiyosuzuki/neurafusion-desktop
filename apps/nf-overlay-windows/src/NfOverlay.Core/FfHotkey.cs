namespace NfOverlay.Core;

/// <summary>Win32 の RegisterHotKey に渡す値（修飾の MOD_* と仮想キーコード）。</summary>
public readonly record struct Win32Hotkey(uint Modifiers, uint VirtualKey);

/// <summary>
/// キーの正規形 {mods, key} → Win32（RegisterHotKey の fsModifiers と vk）。OS を呼ばない純粋な対応表なので Mac でもテストできる。
/// 1文字のキーは US 配列の位置（VK_OEM_*）。押しっぱなしの連打を1回に数えるため、MOD_NOREPEAT を必ず付ける。
/// </summary>
public static class FfHotkey
{
    public const uint MOD_ALT = 0x0001;
    public const uint MOD_CONTROL = 0x0002;
    public const uint MOD_SHIFT = 0x0004;
    public const uint MOD_WIN = 0x0008;
    public const uint MOD_NOREPEAT = 0x4000;

    public const uint VK_ESCAPE = 0x1B;
    public const uint VK_SPACE = 0x20;
    public const uint VK_F1 = 0x70;
    public const uint VK_OEM_1 = 0xBA;      // ;
    public const uint VK_OEM_PLUS = 0xBB;   // =
    public const uint VK_OEM_COMMA = 0xBC;  // ,
    public const uint VK_OEM_MINUS = 0xBD;  // -
    public const uint VK_OEM_PERIOD = 0xBE; // .
    public const uint VK_OEM_2 = 0xBF;      // /
    public const uint VK_OEM_3 = 0xC0;      // `
    public const uint VK_OEM_4 = 0xDB;      // [
    public const uint VK_OEM_6 = 0xDD;      // ]
    public const uint VK_OEM_7 = 0xDE;      // '

    /// <summary>直せないキー（知らない名前・知らない修飾）は null。登録に失敗したキーと同じく ff-keys の failed に入れる。</summary>
    public static Win32Hotkey? Map(FfChord chord)
    {
        uint mods = MOD_NOREPEAT;
        foreach (var m in chord.Mods)
        {
            uint? bit = m switch
            {
                "ctrl" => MOD_CONTROL,
                "alt" => MOD_ALT,
                "shift" => MOD_SHIFT,
                "meta" => MOD_WIN,
                _ => null,
            };
            if (bit is null) return null;
            mods |= bit.Value;
        }
        return VirtualKey(chord.Key) is { } vk ? new Win32Hotkey(mods, vk) : null;
    }

    public static uint? VirtualKey(string key)
    {
        var k = key.ToLowerInvariant();
        if (k.Length == 1)
        {
            var c = k[0];
            if (c is >= 'a' and <= 'z') return (uint)(0x41 + (c - 'a')); // 'A'〜'Z'
            if (c is >= '0' and <= '9') return (uint)(0x30 + (c - '0')); // '0'〜'9'
            return c switch
            {
                '.' => VK_OEM_PERIOD,
                ',' => VK_OEM_COMMA,
                '/' => VK_OEM_2,
                ';' => VK_OEM_1,
                '\'' => VK_OEM_7,
                '[' => VK_OEM_4,
                ']' => VK_OEM_6,
                '-' => VK_OEM_MINUS,
                '=' => VK_OEM_PLUS,
                '`' => VK_OEM_3,
                _ => null,
            };
        }
        if (k is "escape" or "esc") return VK_ESCAPE;
        if (k == "space") return VK_SPACE;
        if (k.Length is 2 or 3 && k[0] == 'f' && int.TryParse(k.AsSpan(1), System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture, out var n) && n is >= 1 and <= 24 && k[1] != '0')
            return VK_F1 + (uint)(n - 1); // F1 0x70 〜 F24 0x87
        return null;
    }
}
