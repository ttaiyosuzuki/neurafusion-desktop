using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Automation;
using NfOverlay.Core;

namespace NfOverlay.Win;

/// <summary>
/// UI Automation で、押されたウィンドウの中の文字を読む（押したときだけ呼ばれる。ReadPlanner が門を通したあと）。
/// 1) 文書（Document）の TextPattern があればその全文
/// 2) 無ければ Text の要素の名前を画面の順に集める
/// 入力欄（Edit）は読まない（本人がまだ送っていない下書きを拾わない）。
/// 最後の答えがいちばん下にある前提で、末尾から MaxChars 文字だけを返す。
/// </summary>
internal sealed class UiaReader : IAnswerReader
{
    public const int MaxChars = 20_000;
    private const int MaxNodes = 5_000;
    private static readonly TimeSpan Budget = TimeSpan.FromSeconds(3);

    public ReadMethod Method => ReadMethod.Uia;

    public Task<string?> ReadAsync(long window, CancellationToken ct) =>
        // UI Automation のクライアント呼び出しは UI スレッドから出さない（自分の窓とのデッドロックを避ける）。
        Task.Factory.StartNew(() => Read(new IntPtr(window), ct), ct,
            TaskCreationOptions.LongRunning, TaskScheduler.Default);

    private static string? Read(IntPtr hwnd, CancellationToken ct)
    {
        var root = AutomationElement.FromHandle(hwnd);
        if (root is null) return null;
        var sw = Stopwatch.StartNew();

        var doc = FromDocuments(root, sw, ct);
        if (!string.IsNullOrWhiteSpace(doc)) return Tail(doc!);

        var sb = new StringBuilder();
        var walker = TreeWalker.ControlViewWalker;
        var stack = new Stack<AutomationElement>();
        stack.Push(root);
        var seen = 0;
        while (stack.Count > 0 && seen < MaxNodes && sw.Elapsed < Budget)
        {
            ct.ThrowIfCancellationRequested();
            var el = stack.Pop();
            seen++;
            ControlType? type;
            try { type = el.Current.ControlType; }
            catch (ElementNotAvailableException) { continue; }
            if (type == ControlType.Edit) continue;
            if (type == ControlType.Text)
            {
                string name;
                try { name = el.Current.Name; }
                catch (ElementNotAvailableException) { continue; }
                if (!string.IsNullOrWhiteSpace(name)) sb.AppendLine(name.Trim());
                continue;
            }

            // 子を逆順に積んで、取り出しを画面の順（前から）にする。
            var children = new List<AutomationElement>();
            try
            {
                for (var c = walker.GetFirstChild(el); c is not null; c = walker.GetNextSibling(c)) children.Add(c);
            }
            catch (ElementNotAvailableException) { }
            for (var i = children.Count - 1; i >= 0; i--) stack.Push(children[i]);
        }
        return sb.Length == 0 ? null : Tail(sb.ToString());
    }

    private static string? FromDocuments(AutomationElement root, Stopwatch sw, CancellationToken ct)
    {
        AutomationElementCollection docs;
        try
        {
            docs = root.FindAll(TreeScope.Subtree,
                new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Document));
        }
        catch (ElementNotAvailableException) { return null; }

        // いちばん大きい文書（会話の本文）を選ぶ。
        string? best = null;
        foreach (AutomationElement d in docs)
        {
            ct.ThrowIfCancellationRequested();
            if (sw.Elapsed > Budget) break;
            try
            {
                if (!d.TryGetCurrentPattern(TextPattern.Pattern, out var p)) continue;
                var text = ((TextPattern)p).DocumentRange.GetText(-1);
                if (text is not null && (best is null || text.Length > best.Length)) best = text;
            }
            catch (ElementNotAvailableException) { }
            catch (InvalidOperationException) { }
        }
        return best;
    }

    private static string Tail(string s)
    {
        s = s.Trim();
        return s.Length <= MaxChars ? s : s[^MaxChars..];
    }
}
