#!/usr/bin/python3
"""VM での確認用: 丸の同意の小窓・画面共有の確認（xdg-desktop-portal-gnome）のボタンを、本人の代わりに AT-SPI で押す。

    press-button.py 撮らない|撮って読む                   … 丸（nf-overlay）の同意の小窓
    press-button.py --portal share [窓の題名の一部]       … 画面共有の確認で「Application Window」→ その窓 → Share
    press-button.py --portal share-default                … 画面共有の確認で、選ばれているもののまま Share
    press-button.py --portal cancel                        … 画面共有の確認で Cancel

見るのは、その2つのアプリの押せる部品の名前だけ。見つかったら do_action(0)（クリックと同じ）。
"""

import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

PRESSABLE = {Atspi.Role.PUSH_BUTTON, Atspi.Role.TOGGLE_BUTTON, Atspi.Role.PAGE_TAB}


def nodes(owner):
    d = Atspi.get_desktop(0)
    for i in range(d.get_child_count()):
        app = d.get_child_at_index(i)
        if app is None or app.get_name() != owner:
            continue
        stack = [(app, 0)]
        while stack:
            n, depth = stack.pop()
            try:
                if n.get_role() in PRESSABLE and n.get_state_set().contains(Atspi.StateType.SHOWING):
                    yield n
                if depth < 40:
                    stack.extend((n.get_child_at_index(j), depth + 1) for j in range(n.get_child_count()))
            except Exception:  # noqa: BLE001
                continue


def press(owner, match, tries=40):
    for _ in range(tries):
        for n in nodes(owner):
            name = n.get_name() or ""
            if match(n, name):
                if n.get_n_actions() > 0:
                    n.do_action(0)
                else:
                    # GTK4 の切り替えタブは操作を持たないことがある → 押せない（呼ぶ側で別の道へ）
                    print("no action", n.get_role_name(), name[:40])
                    return False
                print("pressed", owner, n.get_role_name(), name[:40])
                return True
        time.sleep(0.5)
    print("not found", owner)
    return False


def main():
    a = sys.argv[1:]
    if a and a[0] == "--portal":
        owner = "xdg-desktop-portal-gnome"
        if a[1] == "cancel":
            return 0 if press(owner, lambda n, s: n.get_role() == Atspi.Role.PUSH_BUTTON and s in ("Cancel", "キャンセル")) else 1
        if a[1] == "share-default":
            # 何も選び直さず、最初から選ばれているもの（GNOME の既定は画面全体）のまま Share
            return 0 if press(owner, lambda n, s: n.get_role() == Atspi.Role.PUSH_BUTTON and s in ("Share", "共有")) else 1
        title = a[2] if len(a) > 2 else ""
        # 「Application Window」のタブへ移ってその窓を選ぶ。タブが押せなければ、出ている画面（モニター）を選ぶ
        picked = False
        if title and press(owner, lambda n, s: n.get_role() == Atspi.Role.PAGE_TAB and s == "Application Window", tries=10):
            time.sleep(1)
            picked = press(owner, lambda n, s: n.get_role() == Atspi.Role.TOGGLE_BUTTON and title in s, tries=10)
        if not picked:
            press(owner, lambda n, s: n.get_role() == Atspi.Role.PAGE_TAB and s == "Entire Screen", tries=4)
            time.sleep(1)
            # 既に選ばれている（CHECKED）なら押さない（押すと選択が外れる）
            press(owner, lambda n, s: n.get_role() == Atspi.Role.TOGGLE_BUTTON
                  and not n.get_state_set().contains(Atspi.StateType.CHECKED), tries=4)
        time.sleep(0.5)
        ok = press(owner, lambda n, s: n.get_role() == Atspi.Role.PUSH_BUTTON and s in ("Share", "共有"))
        return 0 if ok else 1
    label = a[0]
    return 0 if press("nf-overlay", lambda n, s: n.get_role() == Atspi.Role.PUSH_BUTTON and s == label) else 1


if __name__ == "__main__":
    sys.exit(main())
