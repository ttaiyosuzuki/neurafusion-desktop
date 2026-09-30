"""FF 先読み（Linux 分）: ff-* の約束の形・キーの X11 への直し方・行の窓の状態（最初の行を1押下に1回だけ知らせる・
overlay-only のキー（adopt・Esc）は表示中だけ）。

OS に依存しない部分だけを試す（GTK・X11・D-Bus は要らない）。
    python3 -m unittest discover -s apps/nf-overlay-linux/tests
"""

from __future__ import annotations

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from nf_overlay.core import ff, protocol  # noqa: E402

CONFIG = {
    "v": 1,
    "type": "ff-config",
    "enabled": True,
    "keys": {
        "trigger": {"mods": ["alt", "shift"], "key": ","},
        "adopt": {"mods": ["alt", "shift"], "key": "."},
        "close": {"mods": [], "key": "escape"},
    },
    "scopes": {"trigger": "global", "adopt": "overlay-only", "close": "overlay-only"},
    "labels": {"trigger": "Alt+Shift+,", "adopt": "Alt+Shift+.", "close": "Escape"},
    "opacity": 0.72,
}


def line(press, seq, text="1  型エラーを直す  N=12", **over):
    body = {"v": 1, "type": "ff-line", "press": press, "seq": seq, "kind": "move", "text": text, "n": 12}
    body.update(over)
    msg = ff.parse_inbound(json.dumps(body, ensure_ascii=False))
    assert msg is not None and msg.line is not None
    return msg.line


class ParseTest(unittest.TestCase):
    def test_config(self):
        msg = ff.parse_inbound(json.dumps(CONFIG).encode("utf-8"))
        self.assertEqual(msg.type, "ff-config")
        c = msg.config
        self.assertTrue(c.enabled)
        self.assertEqual(c.keys["trigger"], ff.Chord(("alt", "shift"), ","))
        self.assertEqual(c.keys["close"], ff.Chord((), "escape"))
        self.assertEqual(c.labels["adopt"], "Alt+Shift+.")
        self.assertAlmostEqual(c.opacity, 0.72)
        self.assertEqual(c.unreadable, ())
        self.assertEqual(c.actions(ff.SCOPE_GLOBAL), ("trigger",))
        self.assertEqual(c.actions(ff.SCOPE_OVERLAY), ("adopt", "close"))

    def test_scopes_default_when_absent_or_unknown(self):
        c = ff.parse_ff_config({"keys": CONFIG["keys"]})
        self.assertEqual(c.scopes, ff.DEFAULT_SCOPES)
        self.assertTrue(c.is_global("trigger"))
        self.assertFalse(c.is_global("adopt"))
        self.assertFalse(c.is_global("close"))
        c = ff.parse_ff_config({"scopes": {"trigger": "sometimes", "adopt": "global"}})
        self.assertEqual(c.scopes, {"trigger": "global", "adopt": "global", "close": "overlay-only"})
        self.assertEqual(c.actions(ff.SCOPE_GLOBAL), ("trigger", "adopt"))
        self.assertEqual(ff.parse_ff_config({"scopes": "x"}).scopes, ff.DEFAULT_SCOPES)

    def test_config_mods_order_and_case(self):
        c = ff.parse_ff_config({"keys": {"trigger": {"mods": ["Shift", "ctrl"], "key": "F5"}}})
        self.assertEqual(c.keys["trigger"], ff.Chord(("ctrl", "shift"), "f5"))

    def test_config_disabled_and_opacity_clamped(self):
        c = ff.parse_ff_config({"enabled": False, "opacity": 5})
        self.assertFalse(c.enabled)
        self.assertEqual(c.opacity, ff.OPACITY_MAX)
        self.assertEqual(ff.parse_ff_config({"opacity": 0}).opacity, ff.OPACITY_MIN)
        self.assertEqual(ff.parse_ff_config({"opacity": "x"}).opacity, ff.OPACITY_DEFAULT)
        self.assertEqual(ff.parse_ff_config({"opacity": True}).opacity, ff.OPACITY_DEFAULT)

    def test_config_unreadable_keys(self):
        c = ff.parse_ff_config({"keys": {"trigger": {"mods": ["hyper"], "key": "a"}, "adopt": {"mods": [], "key": "pageup"}}})
        self.assertEqual(c.keys, {})
        self.assertEqual(c.unreadable, ("trigger", "adopt"))

    def test_line(self):
        ln = line(3, 0, reset=True)
        self.assertEqual((ln.press, ln.seq, ln.kind, ln.n, ln.reset), (3, 0, "move", 12, True))
        self.assertEqual(ln.text, "1  型エラーを直す  N=12")

    def test_line_kind_unknown_and_newlines(self):
        ln = line(1, 2, text="a\nb", kind="weird", n=None)
        self.assertEqual(ln.kind, "info")
        self.assertEqual(ln.text, "a b")
        self.assertIsNone(ln.n)
        self.assertFalse(ln.reset)
        self.assertLessEqual(len(line(1, 0, text="x" * 5000).text), ff.MAX_TEXT_CHARS)

    def test_line_bad_shape_ignored(self):
        self.assertIsNone(ff.parse_inbound('{"v":1,"type":"ff-line","seq":0,"text":"a"}'))
        self.assertIsNone(ff.parse_inbound('{"v":1,"type":"ff-line","press":"1","seq":0,"text":"a"}'))
        self.assertIsNone(ff.parse_inbound('{"v":1,"type":"ff-line","press":1,"seq":0}'))

    def test_hide_and_unknown(self):
        self.assertEqual(ff.parse_inbound('{"v":1,"type":"ff-hide"}').type, "ff-hide")
        self.assertIsNone(ff.parse_inbound('{"v":1,"type":"ff-future"}'))
        self.assertIsNone(ff.parse_inbound('{"v":2,"type":"ff-hide"}'))
        self.assertIsNone(ff.parse_inbound("not json"))
        self.assertIsNone(ff.parse_inbound(b"\xff\xfe"))
        self.assertIsNone(ff.parse_inbound(""))
        # 丸の行は ff の側では読まない（丸の側の parse_inbound も ff-* を読み飛ばす）
        self.assertIsNone(ff.parse_inbound('{"v":1,"type":"stop"}'))
        self.assertIsNone(protocol.parse_inbound(json.dumps(CONFIG)))

    def test_too_long(self):
        big = '{"v":1,"type":"ff-hide","pad":"' + "x" * protocol.MAX_LINE_BYTES + '"}'
        self.assertIsNone(ff.parse_inbound(big))
        self.assertIsNone(ff.parse_inbound(big.encode("utf-8")))


class EncodeTest(unittest.TestCase):
    def test_ff_key(self):
        self.assertEqual(json.loads(ff.ff_key("trigger", 3)), {"v": 1, "type": "ff-key", "action": "trigger", "press": 3})

    def test_ff_drawn(self):
        self.assertEqual(json.loads(ff.ff_drawn(3, 0, 41.74)), {"v": 1, "type": "ff-drawn", "press": 3, "seq": 0, "ms": 41.7})
        self.assertEqual(json.loads(ff.ff_drawn(1, 0, -5))["ms"], 0.0)

    def test_ff_keys(self):
        self.assertEqual(json.loads(ff.ff_keys(False, ["adopt"])), {"v": 1, "type": "ff-keys", "ok": False, "failed": ["adopt"]})
        self.assertEqual(json.loads(ff.ff_keys(True, [])), {"v": 1, "type": "ff-keys", "ok": True, "failed": []})
        # 順は trigger・adopt・close、重ねない
        self.assertEqual(json.loads(ff.ff_keys(False, ["adopt", "trigger", "adopt"]))["failed"], ["trigger", "adopt"])


class ChordTest(unittest.TestCase):
    def test_keysym_names(self):
        cases = {
            ".": "period", ",": "comma", "/": "slash", ";": "semicolon", "'": "apostrophe",
            "[": "bracketleft", "]": "bracketright", "-": "minus", "=": "equal", "`": "grave",
            "escape": "Escape", "space": "space", "f1": "F1", "f12": "F12", "f24": "F24",
            "a": "a", "z": "z", "0": "0", "9": "9",
        }
        for key, name in cases.items():
            self.assertEqual(ff.Chord((), key).keysym_name(), name, key)
        for bad in ("f25", "pageup", "A!", "ä", ""):
            self.assertIsNone(ff.Chord((), bad).keysym_name(), bad)

    def test_masks(self):
        self.assertEqual(ff.Chord(("alt", "shift"), ".").mask(), 8 | 1)
        self.assertEqual(ff.Chord(("ctrl",), "a").mask(), 4)
        self.assertEqual(ff.Chord(("meta",), "a").mask(), 64)
        self.assertEqual(ff.Chord(("ctrl", "alt", "shift", "meta"), "a").mask(), 4 | 8 | 1 | 64)
        self.assertEqual(ff.Chord((), "escape").mask(), 0)

    def test_x11_grabs_include_lock_variants(self):
        grabs = ff.Chord(("alt", "shift"), ".").x11_grabs()
        self.assertEqual(grabs, [("period", 9), ("period", 9 | 2), ("period", 9 | 16), ("period", 9 | 2 | 16)])
        self.assertEqual(ff.Chord((), "pageup").x11_grabs(), [])

    def test_clean_mask(self):
        self.assertEqual(ff.clean_mask(9 | 2 | 16), 9)
        # マウスのボタンの状態（Button1Mask 256）も落とす
        self.assertEqual(ff.clean_mask(4 | 256), 4)

    def test_portal_trigger(self):
        self.assertEqual(ff.Chord(("alt", "shift"), ",").portal_trigger(), "ALT+SHIFT+comma")
        self.assertEqual(ff.Chord((), "escape").portal_trigger(), "Escape")
        self.assertEqual(ff.Chord(("ctrl", "meta"), "f5").portal_trigger(), "CTRL+LOGO+F5")
        self.assertIsNone(ff.Chord((), "pageup").portal_trigger())


class StripStateTest(unittest.TestCase):
    def test_press_counts_up(self):
        s = ff.StripState()
        self.assertEqual(s.on_key("trigger", 10.0), 1)
        self.assertEqual(s.on_key("adopt", 11.0), 2)
        self.assertEqual(s.on_key("close", 12.0), 3)
        self.assertEqual(s.key_time(2), 11.0)

    def test_drawn_once_per_press_first_line(self):
        s = ff.StripState()
        p = s.on_key("trigger", 100.0)
        self.assertTrue(s.on_line(line(p, 0)))
        self.assertFalse(s.on_line(line(p, 1)))
        self.assertTrue(s.has_pending())
        out = [json.loads(x) for x in s.on_drawn(100.0417)]
        self.assertEqual(len(out), 1)
        self.assertEqual((out[0]["press"], out[0]["seq"]), (p, 0))
        self.assertAlmostEqual(out[0]["ms"], 41.7, places=1)
        # 同じ押下の後の行・描き直しでは出さない
        s.on_line(line(p, 2))
        self.assertEqual(s.on_drawn(100.2), [])
        self.assertEqual(s.on_drawn(100.3), [])

    def test_seq_of_first_line_is_reported(self):
        s = ff.StripState()
        p = s.on_key("trigger", 1.0)
        s.on_line(line(p, 3))
        self.assertEqual(json.loads(s.on_drawn(1.5)[0])["seq"], 3)

    def test_new_press_reports_again(self):
        s = ff.StripState()
        p1 = s.on_key("trigger", 1.0)
        s.on_line(line(p1, 0))
        s.on_drawn(1.1)
        p2 = s.on_key("adopt", 2.0)
        s.on_line(line(p2, 0, kind="info", text="クリップボードに入れました"))
        out = [json.loads(x) for x in s.on_drawn(2.05)]
        self.assertEqual([o["press"] for o in out], [p2])
        self.assertAlmostEqual(out[0]["ms"], 50.0, places=1)

    def test_line_without_key_not_reported(self):
        s = ff.StripState()
        s.on_line(line(7, 0))
        self.assertFalse(s.has_pending())
        self.assertEqual(s.on_drawn(1.0), [])

    def test_reset_clears_lines_and_cap(self):
        s = ff.StripState()
        p = s.on_key("trigger", 1.0)
        for i in range(ff.MAX_LINES + 5):
            s.on_line(line(p, i, text=f"{i}"))
        self.assertEqual(len(s.lines), ff.MAX_LINES)
        self.assertEqual(s.lines[-1].text, f"{ff.MAX_LINES + 4}")
        s.on_line(line(p, 99, text="別の枝", reset=True))
        self.assertEqual([ln.text for ln in s.lines], ["別の枝"])

    def test_hide_drops_pending_and_overlay_keys(self):
        s = ff.StripState()
        self.assertFalse(s.overlay_keys_wanted())
        p = s.on_key("trigger", 1.0)
        s.on_line(line(p, 0))
        self.assertTrue(s.overlay_keys_wanted())
        s.enabled = False
        self.assertFalse(s.overlay_keys_wanted())
        s.enabled = True
        self.assertTrue(s.hide())
        self.assertFalse(s.hide())
        self.assertEqual(s.lines, [])
        self.assertFalse(s.overlay_keys_wanted())
        # 描かれる前に隠したら、その押下は知らせない
        self.assertEqual(s.on_drawn(2.0), [])

    def test_accepts_overlay_only_while_visible(self):
        cfg = ff.parse_inbound(json.dumps(CONFIG)).config
        s = ff.StripState()
        # 隠れている間は trigger（global）だけ。adopt・close の知らせが届いても落とす
        self.assertTrue(s.accepts("trigger", cfg))
        self.assertFalse(s.accepts("adopt", cfg))
        self.assertFalse(s.accepts("close", cfg))
        s.on_line(line(s.on_key("trigger", 1.0), 0))
        self.assertTrue(s.accepts("adopt", cfg))
        self.assertTrue(s.accepts("close", cfg))
        self.assertFalse(s.accepts("other", cfg))
        self.assertFalse(s.accepts("trigger", None))
        self.assertFalse(s.accepts("trigger", ff.parse_ff_config({"enabled": False})))

    def test_key_plan_x11(self):
        cfg = ff.parse_inbound(json.dumps(CONFIG)).config
        p = ff.key_plan(cfg, "x11")
        self.assertEqual(p, ff.KeyPlan(at_config=("trigger",), while_visible=("adopt", "close"), unsupported=()))

    def test_key_plan_wayland_binds_global_only(self):
        # Esc・Alt+Shift+. をデスクトップに常に取らせない。overlay-only は ff-config のあと1回だけ failed で知らせる
        cfg = ff.parse_inbound(json.dumps(CONFIG)).config
        p = ff.key_plan(cfg, "wayland")
        self.assertEqual(p, ff.KeyPlan(at_config=("trigger",), while_visible=(), unsupported=("adopt", "close")))
        # 行を出すたびには試さない
        self.assertEqual(p.while_visible, ())

    def test_key_plan_follows_scopes_and_disabled(self):
        c = ff.parse_ff_config({"keys": CONFIG["keys"], "scopes": {"adopt": "global"}})
        self.assertEqual(ff.key_plan(c, "wayland"), ff.KeyPlan(at_config=("trigger", "adopt"), unsupported=("close",)))
        self.assertEqual(ff.key_plan(c, "x11"), ff.KeyPlan(at_config=("trigger", "adopt"), while_visible=("close",)))
        off = ff.parse_ff_config({"enabled": False, "keys": CONFIG["keys"]})
        self.assertEqual(ff.key_plan(off, "wayland"), ff.KeyPlan())
        self.assertEqual(ff.key_plan(off, "x11"), ff.KeyPlan())

    def test_old_press_times_forgotten(self):
        s = ff.StripState()
        for i in range(200):
            s.on_key("trigger", float(i))
        self.assertIsNone(s.key_time(1))
        self.assertEqual(s.key_time(200), 199.0)
        self.assertLessEqual(len(s._key_times), 64)


class Ff07Test(unittest.TestCase):
    """FF-07: 画面共有から隠す API を使わない（Linux 版の全ファイルを静的に見る）。"""

    def test_no_capture_exclusion(self):
        root = os.path.join(os.path.dirname(__file__), "..", "nf_overlay")
        banned = ("sharingType", "SetWindowDisplayAffinity", "setContentProtection", "WDA_EXCLUDEFROMCAPTURE")
        for dirpath, _d, files in os.walk(root):
            for f in files:
                if not f.endswith(".py"):
                    continue
                with open(os.path.join(dirpath, f), encoding="utf-8") as fh:
                    src = fh.read()
                for b in banned:
                    self.assertNotIn(b, src, f"{f}: {b}")


if __name__ == "__main__":
    unittest.main()
