using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows.Forms;
using NfOverlay.Core;

namespace NfOverlay.Win;

/// <summary>
/// FF 先読みの全体キー（RegisterHotKey）の受け口。見えないメッセージ専用の窓（親 HWND_MESSAGE）で WM_HOTKEY を受ける。
/// UI スレッドで作る（登録したスレッドのメッセージループに WM_HOTKEY が届く）。キーの中身は OS が照合するので、
/// このプログラムは他のアプリのキー入力を見ない（フックは使わない）。
/// </summary>
internal sealed class FfHotkeyWindow : NativeWindow, IDisposable
{
    private readonly HashSet<FfAction> _registered = new();

    /// <summary>キーを受けた（役目・受けた瞬間の Stopwatch のタイムスタンプ）。</summary>
    public event Action<FfAction, long>? Pressed;

    public FfHotkeyWindow()
    {
        CreateHandle(new CreateParams { Caption = "nf-overlay-ff-keys", Parent = Native.HWND_MESSAGE });
    }

    public bool IsRegistered(FfAction action) => _registered.Contains(action);

    /// <summary>登録する（前の登録は外してから）。直せないキー・他のアプリが先に取っているキーは false。</summary>
    public bool Register(FfAction action, FfChord chord)
    {
        Unregister(action);
        if (FfHotkey.Map(chord) is not { } hk) return false;
        if (!Native.RegisterHotKey(Handle, Id(action), hk.Modifiers, hk.VirtualKey)) return false;
        _registered.Add(action);
        return true;
    }

    public void Unregister(FfAction action)
    {
        if (_registered.Remove(action)) Native.UnregisterHotKey(Handle, Id(action));
    }

    public void UnregisterAll()
    {
        foreach (var a in new[] { FfAction.Trigger, FfAction.Adopt, FfAction.Close }) Unregister(a);
    }

    // 0x0000〜0xBFFF がアプリの使える番号。役目ごとに固定（1・2・3）。
    private static int Id(FfAction action) => (int)action + 1;

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Native.WM_HOTKEY)
        {
            // 受けた瞬間に単調時計を刻む（ff-drawn.ms の起点。FF-08 の 0.8 秒はここから測る）。
            var at = Stopwatch.GetTimestamp();
            var id = m.WParam.ToInt64();
            FfAction? hit = null;
            foreach (var a in _registered)
                if (Id(a) == id) hit = a;
            // 受け手が登録を変える（close で隠して Esc を外す）ので、数え終えてから呼ぶ。
            if (hit is { } action) Pressed?.Invoke(action, at);
            return;
        }
        base.WndProc(ref m);
    }

    public void Dispose()
    {
        if (Handle == IntPtr.Zero) return;
        UnregisterAll();
        DestroyHandle();
    }
}
