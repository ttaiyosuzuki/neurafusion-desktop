#!/usr/bin/python3
"""VM での確認用: ポータル（xdg-desktop-portal-gnome / GNOME Shell）の撮影の確認で、本人の代わりにボタンを押す。

    accept-portal.py accept|cancel|dump

AT-SPI で、ポータルとシェルの押せるボタンの名前だけを見る（他のアプリの中身は見ない）。見つかったら do_action(0)。
"""

import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402

OWNERS = ("xdg-desktop-portal-gnome", "gnome-shell")
ACCEPT = ("Take Screenshot", "Capture", "Share", "Allow", "スクリーンショットを撮る", "撮影", "共有", "許可")
CANCEL = ("Cancel", "Deny", "キャンセル", "拒否")
ROLES = {Atspi.Role.PUSH_BUTTON, Atspi.Role.TOGGLE_BUTTON, Atspi.Role.BUTTON if hasattr(Atspi.Role, "BUTTON") else Atspi.Role.PUSH_BUTTON}


def buttons():
    d = Atspi.get_desktop(0)
    out = []
    for i in range(d.get_child_count()):
        app = d.get_child_at_index(i)
        if app is None or (app.get_name() or "") not in OWNERS:
            continue
        stack = [(app, 0)]
        while stack:
            n, depth = stack.pop()
            try:
                if n.get_role() in ROLES and n.get_state_set().contains(Atspi.StateType.SHOWING):
                    out.append((app.get_name(), n.get_name() or "", n))
                if depth < 40:
                    for j in range(n.get_child_count()):
                        c = n.get_child_at_index(j)
                        if c is not None:
                            stack.append((c, depth + 1))
            except Exception:  # noqa: BLE001
                continue
    return out


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "dump"
    want = ACCEPT if mode == "accept" else CANCEL
    for _ in range(20):
        bs = buttons()
        print("buttons:", [(a, n) for a, n, _ in bs])
        if mode != "dump":
            for app, name, node in bs:
                if any(w.lower() == name.lower() for w in want):
                    node.do_action(0)
                    print("pressed:", app, name)
                    return 0
        else:
            return 0
        time.sleep(1)
    print("not found")
    return 1


if __name__ == "__main__":
    sys.exit(main())
