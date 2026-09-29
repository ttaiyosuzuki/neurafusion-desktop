#!/usr/bin/python3
"""VM での確認用: 丸の同意の小窓のボタンを、本人の代わりに AT-SPI で押す。

    press-button.py 撮らない|撮って読む

見るのは nf-overlay（丸の本体）の押せるボタンの名前だけ。見つかったら do_action(0)（クリックと同じ）。
"""

import sys
import time

import gi

gi.require_version("Atspi", "2.0")
from gi.repository import Atspi  # noqa: E402


def find(label):
    d = Atspi.get_desktop(0)
    for i in range(d.get_child_count()):
        app = d.get_child_at_index(i)
        if app is None or app.get_name() != "nf-overlay":
            continue
        stack = [(app, 0)]
        while stack:
            n, depth = stack.pop()
            try:
                if n.get_role() == Atspi.Role.PUSH_BUTTON and n.get_name() == label and n.get_state_set().contains(Atspi.StateType.SHOWING):
                    return n
                if depth < 30:
                    stack.extend((n.get_child_at_index(j), depth + 1) for j in range(n.get_child_count()))
            except Exception:  # noqa: BLE001
                continue
    return None


def main():
    label = sys.argv[1]
    for _ in range(40):
        b = find(label)
        if b is not None:
            b.do_action(0)
            print("pressed", label)
            return 0
        time.sleep(0.5)
    print("not found", label)
    return 1


if __name__ == "__main__":
    sys.exit(main())
