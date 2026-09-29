using System;
using System.Diagnostics;
using NfOverlay.Core;

namespace NfOverlay.Win;

/// <summary>
/// 前面ウィンドウの切り替えと、対象ウィンドウの位置・大きさの変化を OS のイベントで受ける。
/// 受け取るのは「どのウィンドウが前面か」と「その枠の座標」だけで、中身（文字・画面）は読まない。
/// 位置のイベントは対象のプロセスに絞って付け直す（全プロセスのマウス移動等を受けない）。
/// コールバックは UI スレッドのメッセージループで届く。
/// </summary>
internal sealed class WindowWatcher : IDisposable
{
    private readonly Native.WinEventProc _proc; // GC に回収されないよう保持する
    private readonly uint _ownPid = (uint)Environment.ProcessId;
    private IntPtr _foregroundHook;
    private readonly System.Collections.Generic.List<IntPtr> _pidHooks = new();
    private IntPtr _minimizeHook;
    private uint _hookedPid;
    private long _target;

    public event Action<WindowState?>? ForegroundChanged;
    public event Action<WindowState>? TargetMoved;

    public WindowWatcher()
    {
        _proc = OnEvent;
    }

    public void Start()
    {
        _foregroundHook = Native.SetWinEventHook(Native.EVENT_SYSTEM_FOREGROUND, Native.EVENT_SYSTEM_FOREGROUND,
            IntPtr.Zero, _proc, 0, 0, Native.WINEVENT_OUTOFCONTEXT);
        // 最小化・元に戻す（どのプロセスでも前面切り替えと同じくらいの頻度しか来ない）。
        _minimizeHook = Native.SetWinEventHook(Native.EVENT_SYSTEM_MINIMIZESTART, Native.EVENT_SYSTEM_MINIMIZEEND,
            IntPtr.Zero, _proc, 0, 0, Native.WINEVENT_OUTOFCONTEXT | Native.WINEVENT_SKIPOWNPROCESS);
    }

    /// <summary>今の前面ウィンドウの形（起動直後・設定の変更時に使う）。</summary>
    public WindowState? Foreground() => Probe(Native.GetForegroundWindow());

    /// <summary>位置のイベントを受ける対象。FollowTracker.Tracked を渡す（0 なら外す）。</summary>
    public void SetTarget(long hwnd)
    {
        if (_target == hwnd) return;
        _target = hwnd;
        uint pid = 0;
        if (hwnd != 0) Native.GetWindowThreadProcessId(new IntPtr(hwnd), out pid);
        if (pid == _hookedPid) return;

        UnhookPid();
        _hookedPid = pid;
        if (pid == 0) return;
        // 対象のプロセスの「位置の変化」「ウィンドウの破棄」「隠れた・現れた」だけ。名前・値の変化などは受けない。
        foreach (var (min, max) in new[]
                 {
                     (Native.EVENT_OBJECT_LOCATIONCHANGE, Native.EVENT_OBJECT_LOCATIONCHANGE),
                     (Native.EVENT_OBJECT_DESTROY, Native.EVENT_OBJECT_DESTROY),
                     (Native.EVENT_OBJECT_CLOAKED, Native.EVENT_OBJECT_UNCLOAKED),
                 })
        {
            var h = Native.SetWinEventHook(min, max, IntPtr.Zero, _proc, pid, 0, Native.WINEVENT_OUTOFCONTEXT);
            if (h != IntPtr.Zero) _pidHooks.Add(h);
        }
    }

    private void UnhookPid()
    {
        foreach (var h in _pidHooks) Native.UnhookWinEvent(h);
        _pidHooks.Clear();
    }

    private void OnEvent(IntPtr hook, uint evt, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
    {
        try
        {
            switch (evt)
            {
                case Native.EVENT_SYSTEM_FOREGROUND:
                    ForegroundChanged?.Invoke(Probe(hwnd));
                    break;
                case Native.EVENT_SYSTEM_MINIMIZESTART:
                case Native.EVENT_SYSTEM_MINIMIZEEND:
                case Native.EVENT_OBJECT_LOCATIONCHANGE:
                case Native.EVENT_OBJECT_CLOAKED:
                case Native.EVENT_OBJECT_UNCLOAKED:
                    if (idObject != Native.OBJID_WINDOW || idChild != Native.CHILDID_SELF) return;
                    if (hwnd.ToInt64() != _target) return;
                    if (Probe(hwnd) is { } s) TargetMoved?.Invoke(s);
                    break;
                case Native.EVENT_OBJECT_DESTROY:
                    if (idObject == Native.OBJID_WINDOW && hwnd.ToInt64() == _target)
                        ForegroundChanged?.Invoke(Foreground());
                    break;
            }
        }
        catch (Exception ex)
        {
            // フックの中で例外を投げると OS 側に伝わるので、ここで止める。
            Debug.WriteLine(ex.GetType().Name);
        }
    }

    /// <summary>ウィンドウの形だけを調べる。</summary>
    public WindowState? Probe(IntPtr hwnd)
    {
        if (hwnd == IntPtr.Zero || !Native.IsWindow(hwnd)) return null;
        Native.GetWindowThreadProcessId(hwnd, out var pid);
        var own = pid == _ownPid;
        var exe = own ? "" : Native.ProcessImagePath(pid);

        // 影や見えない縁を除いた、見えている枠。取れなければ GetWindowRect。
        Native.RECT r;
        if (Native.DwmGetWindowAttribute(hwnd, Native.DWMWA_EXTENDED_FRAME_BOUNDS, out r,
                System.Runtime.InteropServices.Marshal.SizeOf<Native.RECT>()) != 0)
            Native.GetWindowRect(hwnd, out r);

        var mon = Native.MonitorFromWindow(hwnd, Native.MONITOR_DEFAULTTONEAREST);
        var mi = new Native.MONITORINFO { cbSize = System.Runtime.InteropServices.Marshal.SizeOf<Native.MONITORINFO>() };
        Native.GetMonitorInfo(mon, ref mi);

        var dpi = Native.GetDpiForWindow(hwnd);
        var cloaked = Native.DwmGetWindowAttribute(hwnd, Native.DWMWA_CLOAKED, out int c, sizeof(int)) == 0 && c != 0;

        return new WindowState(
            hwnd.ToInt64(),
            exe,
            Rect.FromLtrb(r.Left, r.Top, r.Right, r.Bottom),
            Rect.FromLtrb(mi.rcWork.Left, mi.rcWork.Top, mi.rcWork.Right, mi.rcWork.Bottom),
            dpi == 0 ? 1.0 : dpi / 96.0,
            Minimized: Native.IsIconic(hwnd) || !Native.IsWindowVisible(hwnd),
            Cloaked: cloaked,
            OwnProcess: own);
    }

    public void Dispose()
    {
        foreach (var h in new[] { _foregroundHook, _minimizeHook })
            if (h != IntPtr.Zero) Native.UnhookWinEvent(h);
        _foregroundHook = _minimizeHook = IntPtr.Zero;
        UnhookPid();
    }
}
