"""TS-38（Linux 分）: 追従・押すまで読まない・同意を断れば撮らない・記録は数だけ・約束の形。

OS に依存しない部分だけを試す（GTK・AT-SPI・X11 は要らない）。
    python3 -m unittest discover -s apps/nf-overlay-linux/tests
"""

from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from nf_overlay.core import protocol  # noqa: E402
from nf_overlay.core.follow import FollowTracker, WindowInfo, fixed_decision  # noqa: E402
from nf_overlay.core.geometry import Rect, place  # noqa: E402
from nf_overlay.core.reading import ReadGate, ReadLog, ReadPlanner, ReadTicket, ScreenDenied  # noqa: E402

SECRET = "山田太郎 090-1234-5678 の答え"
WORK = Rect(0, 27, 1920, 1053)


def cfg(**over):
    base = {
        "v": 1,
        "type": "config",
        "apps": [
            {"id": "cursor", "label": "Cursor", "mac": [], "win": [], "linux": ["cursor"], "enabled": True, "read": "ax-then-ocr"},
            {"id": "notion", "label": "Notion", "linux": ["notion"], "enabled": False, "read": "ax-then-ocr"},
        ],
        "panelMode": "disconnected",
        "ocrConsent": "ask-each-time",
        "size": 44,
        "margin": 16,
    }
    base.update(over)
    msg = protocol.parse_inbound(json.dumps(base))
    assert msg is not None and msg.config is not None
    return msg.config


def win(xid=0x3A00007, names=("cursor", "Cursor"), frame=Rect(100, 80, 1200, 800), minimized=False):
    return WindowInfo(xid, tuple(names), frame, WORK, minimized)


class FakeClock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class FakeReader:
    def __init__(self, method, result=None, exc=None):
        self.method = method
        self.result = result
        self.exc = exc
        self.calls = 0

    def read(self, window):
        self.calls += 1
        if self.exc:
            raise self.exc
        return self.result


class FollowTests(unittest.TestCase):
    def test_dot_sits_bottom_right_and_follows_move_and_resize(self):
        t = FollowTracker(cfg())
        d = t.on_active(win())
        self.assertEqual(d.dot, Rect(100 + 1200 - 16 - 44, 80 + 800 - 16 - 44, 44, 44))
        g = json.loads(d.line)
        self.assertEqual((g["type"], g["app"]), ("geometry", "cursor"))
        self.assertEqual(g["window"], {"x": 100, "y": 80, "w": 1200, "h": 800})
        # 移動
        d = t.on_geometry(0x3A00007, Rect(300, 200, 1200, 800))
        self.assertEqual(d.dot, Rect(300 + 1140, 200 + 740, 44, 44))
        # 大きさの変更
        d = t.on_geometry(0x3A00007, Rect(300, 200, 640, 480))
        self.assertEqual(d.dot, Rect(300 + 640 - 60, 200 + 480 - 60, 44, 44))
        # 別のウィンドウの通知は無視
        self.assertIsNone(t.on_geometry(0x999, Rect(0, 0, 10, 10)))

    def test_same_position_is_not_emitted_twice(self):
        t = FollowTracker(cfg())
        self.assertIsNotNone(t.on_active(win()).line)
        self.assertIsNone(t.on_geometry(0x3A00007, Rect(100, 80, 1200, 800)).line)

    def test_hidden_for_non_target_disabled_minimized_small(self):
        t = FollowTracker(cfg())
        d = t.on_active(win(names=("gnome-terminal-server", "Gnome-terminal")))
        self.assertIsNone(d.dot)
        self.assertEqual(json.loads(d.line)["reason"], "not-target")
        d = t.on_active(win(names=("notion",)))
        self.assertEqual((json.loads(d.line)["reason"], json.loads(d.line)["detail"]), ("disabled", "app-off"))
        d = t.on_active(win(minimized=True))
        self.assertEqual(json.loads(d.line)["detail"], "minimized")
        d = t.on_active(win(frame=Rect(0, 0, 60, 60)))
        self.assertEqual(json.loads(d.line)["detail"], "too-small")
        d = t.on_active(None)
        self.assertEqual(json.loads(d.line)["reason"], "no-window")

    def test_app_toggle_applies_without_restart(self):
        t = FollowTracker(cfg())
        t.on_active(win())
        off = cfg(apps=[{"id": "cursor", "label": "Cursor", "linux": ["cursor"], "enabled": False}])
        d = t.set_config(off)
        self.assertIsNone(d.dot)
        self.assertEqual(json.loads(d.line)["detail"], "app-off")
        d = t.set_config(cfg())
        self.assertIsNotNone(d.dot)

    def test_global_off_hides(self):
        t = FollowTracker(cfg(enabled=False))
        self.assertEqual(json.loads(t.on_active(win()).line)["detail"], "all-off")

    def test_dot_clamped_into_work_area(self):
        dot = place(Rect(1500, 700, 800, 600), WORK, 44, 16)
        self.assertEqual((dot.right, dot.bottom), (WORK.right, WORK.bottom))

    def test_wayland_fixed_bottom_right(self):
        d = fixed_decision(cfg(), WORK)
        self.assertEqual(d.dot, Rect(1920 - 60, 27 + 1053 - 60, 44, 44))
        g = json.loads(d.line)
        self.assertEqual((g["app"], g["fixed"]), ("*", True))
        self.assertIsNone(fixed_decision(cfg(enabled=False), WORK).dot)


class GateTests(unittest.TestCase):
    def test_nothing_is_read_without_click(self):
        gate, log = ReadGate(), ReadLog()
        atspi = FakeReader("atspi", SECRET)
        out = ReadPlanner(gate, log).run(None, 1, cfg(), atspi, None, lambda a: True)
        self.assertFalse(out.allowed)
        self.assertIsNone(out.protocol_line())
        self.assertEqual(atspi.calls, 0)

    def test_ticket_cannot_be_forged(self):
        with self.assertRaises(PermissionError):
            ReadTicket(1, "cursor", 1, 0.0, object())

    def test_ticket_is_one_shot_bound_to_window_and_expires(self):
        clock = FakeClock()
        gate = ReadGate(clock)
        tk = gate.on_click("cursor", 7)
        self.assertFalse(gate.try_consume(tk, 8))  # 別のウィンドウ
        tk = gate.on_click("cursor", 7)
        self.assertTrue(gate.try_consume(tk, 7))
        self.assertFalse(gate.try_consume(tk, 7))  # 2度目
        tk = gate.on_click("cursor", 7)
        clock.t += 11
        self.assertFalse(gate.try_consume(tk, 7))  # 10 秒を過ぎた
        old = gate.on_click("cursor", 7)
        new = gate.on_click("cursor", 7)
        self.assertFalse(gate.try_consume(old, 7))  # 新しく押した方だけ
        self.assertTrue(gate.try_consume(new, 7))

    def test_no_ticket_without_app(self):
        self.assertIsNone(ReadGate().on_click(None, 1))


class PlannerTests(unittest.TestCase):
    def run_once(self, atspi, ocr, consent, config=None, log=None, window=5, app="cursor"):
        gate = ReadGate()
        log = log or ReadLog()
        tk = gate.on_click(app, window)
        asked = []

        def ask(a):
            asked.append(a)
            return consent

        out = ReadPlanner(gate, log).run(tk, window, config or cfg(), atspi, ocr, ask)
        return out, log, asked

    def test_atspi_first_and_ocr_not_touched(self):
        atspi, ocr = FakeReader("atspi", SECRET), FakeReader("ocr", "x")
        out, log, asked = self.run_once(atspi, ocr, True)
        self.assertTrue(out.ok)
        self.assertEqual(out.method, "atspi")
        self.assertEqual((ocr.calls, asked), (0, []))
        line = json.loads(out.protocol_line())
        self.assertEqual((line["method"], line["chars"], line["text"]), ("atspi", len(SECRET), SECRET))

    def test_consent_declined_means_no_capture(self):
        atspi, ocr = FakeReader("atspi", ""), FakeReader("ocr", SECRET)
        out, log, asked = self.run_once(atspi, ocr, False)
        self.assertEqual(ocr.calls, 0)
        self.assertEqual(asked, ["cursor"])
        line = json.loads(out.protocol_line())
        self.assertEqual((line["ok"], line["method"], line["reason"]), (False, "none", "consent-declined"))
        self.assertNotIn("text", line)
        # 断ったことは「OCR で読めない」とは数えない
        self.assertEqual(log.get("cursor").ocr_ng, 0)

    def test_consent_asked_every_time(self):
        log = ReadLog()
        asked_total = 0
        for _ in range(3):
            _, _, asked = self.run_once(FakeReader("atspi", ""), FakeReader("ocr", SECRET), True, log=log)
            asked_total += len(asked)
        self.assertEqual(asked_total, 3)

    def test_ocr_fallback_and_preference(self):
        log = ReadLog()
        out, _, _ = self.run_once(FakeReader("atspi", "  "), FakeReader("ocr", SECRET), True, log=log)
        self.assertEqual(out.method, "ocr")
        self.assertEqual([a["method"] for a in out.attempts], ["atspi", "ocr"])
        # 次からは OCR を先に試す（読めないと分かっている方で待たせない）
        atspi = FakeReader("atspi", "")
        out, _, _ = self.run_once(atspi, FakeReader("ocr", SECRET), True, log=log)
        self.assertEqual(atspi.calls, 0)
        self.assertEqual(log.get("cursor").status, "ocr")

    def test_errors_do_not_leak_message(self):
        out, log, _ = self.run_once(FakeReader("atspi", exc=RuntimeError(SECRET)), FakeReader("ocr", exc=RuntimeError(SECRET)), True)
        line = out.protocol_line()
        self.assertNotIn("山田", line)
        self.assertEqual(json.loads(line)["reason"], "ocr-error")
        self.assertEqual(log.get("cursor").status, "unreadable")

    def test_portal_denied_is_screen_denied_and_not_counted(self):
        out, log, _ = self.run_once(None, FakeReader("ocr", exc=ScreenDenied()), True, app="*", window=0)
        self.assertEqual(json.loads(out.protocol_line())["reason"], "screen-denied")
        self.assertEqual(log.get("*").ocr_ng, 0)

    def test_read_off_and_ax_only(self):
        off = cfg(apps=[{"id": "cursor", "label": "C", "linux": ["cursor"], "read": "off"}])
        atspi = FakeReader("atspi", SECRET)
        out, _, _ = self.run_once(atspi, None, True, config=off)
        self.assertEqual((atspi.calls, out.reason), (0, "read-off"))
        only = cfg(apps=[{"id": "cursor", "label": "C", "linux": ["cursor"], "read": "atspi-only"}])
        ocr = FakeReader("ocr", SECRET)
        out, _, asked = self.run_once(FakeReader("atspi", ""), ocr, True, config=only)
        self.assertEqual((ocr.calls, asked, out.reason), (0, [], "atspi-empty"))

    def test_text_is_capped_to_tail(self):
        out, _, _ = self.run_once(FakeReader("atspi", "a" * 5 + "b" * 20_000), None, True)
        self.assertEqual(len(out.text), 20_000)
        self.assertTrue(out.text.startswith("b"))

    def test_read_log_keeps_counts_only(self):
        log = ReadLog()
        self.run_once(FakeReader("atspi", SECRET), None, True, log=log)
        raw = log.to_json()
        self.assertNotIn("山田", raw)
        self.assertNotIn("090", raw)
        self.assertEqual(json.loads(raw)["apps"]["cursor"]["atspiOk"], 1)
        back = ReadLog.from_json(raw)
        self.assertEqual(back.get("cursor").atspi_ok, 1)
        self.assertEqual(ReadLog.from_json("{壊れた").to_wire(), {})


class ProtocolTests(unittest.TestCase):
    def test_config_shapes(self):
        c = cfg(panelUrl="http://127.0.0.1:8787/panel", panelMode="url")
        self.assertEqual(c.panel_mode, "url")
        self.assertEqual(c.apps[0].linux, ("cursor",))
        self.assertEqual(c.match(["Cursor"]).id, "cursor")
        bad = cfg(panelUrl="http://evil.example/panel", panelMode="url")
        self.assertEqual((bad.panel_url, bad.panel_mode), (None, "disconnected"))
        obj = cfg(apps=[{"id": "x", "label": "X", "linux": {"wmClass": ["Foo"]}, "read": "uia-then-ocr"}])
        self.assertEqual((obj.apps[0].linux, obj.apps[0].read), (("foo",), "ax-then-ocr"))

    def test_instance_wins_over_class(self):
        c = cfg(apps=[
            {"id": "a", "label": "A", "linux": ["nf-fake-ai"]},
            {"id": "b", "label": "B", "linux": ["nf-fake-ai-noa11y"]},
        ])
        self.assertEqual(c.match(("nf-fake-ai-noa11y", "Nf-fake-ai")).id, "b")
        self.assertEqual(c.match(("other", "Nf-fake-ai")).id, "a")
        self.assertIsNone(c.match(("", "")))

    def test_unknown_and_broken_lines_are_skipped(self):
        for line in ["", "not json", "[]", '{"v":1,"type":"dance"}', '{"v":2,"type":"stop"}']:
            self.assertIsNone(protocol.parse_inbound(line))
        self.assertEqual(protocol.parse_inbound('{"v":1,"type":"stop"}').type, "stop")
        self.assertEqual(protocol.parse_inbound('{"v":1,"type":"get-read-log"}').type, "get-read-log")
        self.assertEqual(protocol.parse_inbound('{"v":1,"type":"panel-text","text":"x"}').text, "x")
        self.assertIsNone(protocol.parse_inbound(b"\xff\xfe"))

    def test_outbound_shapes(self):
        r = json.loads(protocol.ready("wayland", False, True, True, "0.1.0"))
        self.assertEqual((r["v"], r["type"], r["platform"], r["session"]), (1, "ready", "linux", "wayland"))
        self.assertEqual(set(r), {"v", "type", "platform", "session", "ax", "screen", "ocr", "version"})
        ng = json.loads(protocol.read("cursor", "none", False, SECRET, "ocr-empty", []))
        self.assertNotIn("text", ng)
        self.assertEqual(ng["chars"], 0)
        g = json.loads(protocol.geometry("cursor", Rect(10, 20, 100, 100), Rect(50, 60, 44, 44), 2.0))
        self.assertEqual(g["px"]["dot"], {"x": 100, "y": 120, "w": 88, "h": 88})
        self.assertEqual(json.loads(protocol.panel(True, "url")), {"v": 1, "type": "panel", "open": True, "mode": "url"})


if __name__ == "__main__":
    unittest.main()
