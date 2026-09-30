"""FF 先読み — Node ⇄ ネイティブの約束（docs/overlay-protocol.md「FF 先読み」）の Linux 版の読み書きと、行の窓の状態。

OS の部品（GTK・X11・D-Bus）に依存しない。丸と同じ通り道・同じ v:1 で、type が ff-* の行だけを扱う。
- Node → ネイティブ: ff-config（全体キー・表記・不透明度）／ff-line（1行）／ff-hide（閉じる）
- ネイティブ → Node: ff-key（キーを受けた）／ff-drawn（その押下の最初の行を描いた・キーからの ms）／ff-keys（登録の成否）

キーには範囲（scopes）がある: "global"（いつでも効く全体キー。既定は trigger だけ）と "overlay-only"
（行が出ている間だけ取り、隠したら外す。既定は adopt・close）。ff-config に scopes が無ければ既定の割り当て。
Wayland（ポータル）は「表示中だけ」の登録ができないので global だけ登録し、overlay-only は使えないキーとして
ff-config のあと1回だけ ff-keys の failed で知らせる（key_plan）。

キーの正規形 {mods, key}（src/ff/keys.ts）を X11 の keysym の名前と修飾キーのマスクに直す。
CapsLock・NumLock が付いていても効くよう、同じキーをそれらのマスクを足した組でも取る（XGrabKey は修飾キーの完全一致）。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from .protocol import MAX_LINE_BYTES, VERSION, _line

ACTIONS = ("trigger", "adopt", "close")
SCOPE_GLOBAL = "global"
SCOPE_OVERLAY = "overlay-only"
SCOPES = (SCOPE_GLOBAL, SCOPE_OVERLAY)
# ff-config に scopes が無いときの割り当て（keys.json v2）
DEFAULT_SCOPES = {"trigger": SCOPE_GLOBAL, "adopt": SCOPE_OVERLAY, "close": SCOPE_OVERLAY}
MODS = ("ctrl", "alt", "shift", "meta")
KINDS = ("move", "none", "info")

# X11 の修飾キーのマスク（X.h）
SHIFT_MASK = 1
LOCK_MASK = 2  # CapsLock
CONTROL_MASK = 4
MOD1_MASK = 8  # Alt
MOD2_MASK = 16  # NumLock
MOD4_MASK = 64  # Super（meta）
MOD_MASKS = {"shift": SHIFT_MASK, "ctrl": CONTROL_MASK, "alt": MOD1_MASK, "meta": MOD4_MASK}
# 同じキーを CapsLock・NumLock・その両方が付いた組でも取る
LOCK_VARIANTS = (0, LOCK_MASK, MOD2_MASK, LOCK_MASK | MOD2_MASK)

# 1文字キー（US 配列の位置）→ X11 の keysym の名前
_CHAR_KEYSYMS = {
    ".": "period",
    ",": "comma",
    "/": "slash",
    ";": "semicolon",
    "'": "apostrophe",
    "[": "bracketleft",
    "]": "bracketright",
    "-": "minus",
    "=": "equal",
    "`": "grave",
}
_NAMED_KEYSYMS = {"escape": "Escape", "space": "space", **{f"f{i}": f"F{i}" for i in range(1, 25)}}

# xdg-desktop-portal の GlobalShortcuts の preferred_trigger（shortcuts の書き方: 修飾キー + xkb の keysym の名前）
_PORTAL_MODS = {"ctrl": "CTRL", "alt": "ALT", "shift": "SHIFT", "meta": "LOGO"}

# 不透明度（Node の範囲 0.3〜0.95）
OPACITY_DEFAULT = 0.72
OPACITY_MIN = 0.3
OPACITY_MAX = 0.95
# 一度に出しておく行の上限（それより前の行は押し出す）
MAX_LINES = 12
MAX_TEXT_CHARS = 200
# 押下の時刻を覚えておく数
_KEEP_PRESSES = 64


@dataclass(frozen=True)
class Chord:
    mods: tuple[str, ...]
    key: str

    def keysym_name(self) -> str | None:
        """X11 の keysym の名前（XStringToKeysym に渡す）。知らないキーは None。"""
        k = self.key
        if k in _CHAR_KEYSYMS:
            return _CHAR_KEYSYMS[k]
        if k in _NAMED_KEYSYMS:
            return _NAMED_KEYSYMS[k]
        if len(k) == 1 and ("a" <= k <= "z" or "0" <= k <= "9"):
            return k
        return None

    def mask(self) -> int:
        m = 0
        for mod in self.mods:
            m |= MOD_MASKS[mod]
        return m

    def x11_grabs(self) -> list[tuple[str, int]]:
        """XGrabKey に渡す (keysym の名前, 修飾キーのマスク) の組。CapsLock・NumLock 付きの組も含む。読めなければ空。"""
        name = self.keysym_name()
        if name is None:
            return []
        base = self.mask()
        return [(name, base | extra) for extra in LOCK_VARIANTS]

    def portal_trigger(self) -> str | None:
        """GlobalShortcuts の preferred_trigger の形（例: "ALT+SHIFT+period"）。読めなければ None。"""
        name = self.keysym_name()
        if name is None:
            return None
        return "+".join([_PORTAL_MODS[m] for m in MODS if m in self.mods] + [name])


def clean_mask(state: int) -> int:
    """届いたキーの修飾キーの状態から CapsLock・NumLock を除き、比べられる形にする。"""
    return state & (SHIFT_MASK | CONTROL_MASK | MOD1_MASK | MOD4_MASK)


def parse_chord(v: Any) -> Chord | None:
    if not isinstance(v, dict):
        return None
    key = v.get("key")
    if not isinstance(key, str) or not key:
        return None
    key = key.lower()
    mods_raw = v.get("mods", [])
    if not isinstance(mods_raw, list):
        return None
    mods: set[str] = set()
    for m in mods_raw:
        if not isinstance(m, str) or m.lower() not in MODS:
            return None
        mods.add(m.lower())
    c = Chord(tuple(m for m in MODS if m in mods), key)
    return c if c.keysym_name() is not None else None


@dataclass(frozen=True)
class FfConfig:
    enabled: bool = True
    # 読めなかったキーは入れない（登録の失敗として ff-keys に出す）
    keys: dict[str, Chord] = field(default_factory=dict)
    labels: dict[str, str] = field(default_factory=dict)
    opacity: float = OPACITY_DEFAULT
    # action → "global" / "overlay-only"
    scopes: dict[str, str] = field(default_factory=lambda: dict(DEFAULT_SCOPES))
    # 送られてきたが読めなかった action
    unreadable: tuple[str, ...] = ()

    def actions(self, scope: str) -> tuple[str, ...]:
        """その範囲の action（trigger・adopt・close の順）。"""
        return tuple(a for a in ACTIONS if self.scopes.get(a, DEFAULT_SCOPES[a]) == scope)

    def is_global(self, action: str) -> bool:
        return self.scopes.get(action, DEFAULT_SCOPES.get(action)) == SCOPE_GLOBAL


@dataclass(frozen=True)
class KeyPlan:
    """どのキーをいつ登録するか。"""

    # ff-config のたびに登録する
    at_config: tuple[str, ...] = ()
    # 行が出ている間だけ登録する（隠したら外す）
    while_visible: tuple[str, ...] = ()
    # この画面では使えない。ff-config のあと1回だけ failed で知らせ、行を出すたびには試さない
    unsupported: tuple[str, ...] = ()


def key_plan(cfg: FfConfig, session: str) -> KeyPlan:
    """画面の種類（"x11" / "wayland"）ごとの登録の仕方。

    X11: global は常に、overlay-only は行が出ている間だけ XGrabKey。
    Wayland: ポータルに登録したキーはデスクトップが常に取る（Esc などを他のアプリから奪う）ので global だけ登録し、
    overlay-only（既定は adopt・close）は使えないものとして知らせる。
    """
    if not cfg.enabled:
        return KeyPlan()
    glob, over = cfg.actions(SCOPE_GLOBAL), cfg.actions(SCOPE_OVERLAY)
    if session == "wayland":
        return KeyPlan(at_config=glob, unsupported=over)
    return KeyPlan(at_config=glob, while_visible=over)


@dataclass(frozen=True)
class FfLine:
    press: int
    seq: int
    kind: str
    text: str
    n: int | None = None
    reset: bool = False


@dataclass(frozen=True)
class FfInbound:
    type: str
    config: FfConfig | None = None
    line: FfLine | None = None


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v


def parse_ff_config(obj: dict[str, Any]) -> FfConfig:
    keys: dict[str, Chord] = {}
    unreadable: list[str] = []
    raw = obj.get("keys") if isinstance(obj.get("keys"), dict) else {}
    for a in ACTIONS:
        if a not in raw:
            continue
        c = parse_chord(raw[a])
        if c is None:
            unreadable.append(a)
        else:
            keys[a] = c
    labels_raw = obj.get("labels") if isinstance(obj.get("labels"), dict) else {}
    labels = {a: labels_raw[a] for a in ACTIONS if isinstance(labels_raw.get(a), str)}
    scopes_raw = obj.get("scopes") if isinstance(obj.get("scopes"), dict) else {}
    # 知らない値・無い action は既定の割り当て
    scopes = {a: scopes_raw[a] if scopes_raw.get(a) in SCOPES else DEFAULT_SCOPES[a] for a in ACTIONS}
    op = obj.get("opacity")
    opacity = max(OPACITY_MIN, min(OPACITY_MAX, float(op))) if _num(op) else OPACITY_DEFAULT
    return FfConfig(
        enabled=obj.get("enabled") is not False,
        keys=keys,
        labels=labels,
        opacity=opacity,
        scopes=scopes,
        unreadable=tuple(unreadable),
    )


def parse_ff_line(obj: dict[str, Any]) -> FfLine | None:
    press, seq, text = obj.get("press"), obj.get("seq"), obj.get("text")
    if not _num(press) or not _num(seq) or not isinstance(text, str):
        return None
    kind = obj.get("kind") if obj.get("kind") in KINDS else "info"
    n = obj.get("n")
    # 1行に収める（改行は空白に。長すぎる行は切る）
    text = " ".join(text.splitlines())[:MAX_TEXT_CHARS]
    return FfLine(
        press=int(press),
        seq=int(seq),
        kind=kind,
        text=text,
        n=int(n) if _num(n) else None,
        reset=obj.get("reset") is True,
    )


def parse_inbound(line: str | bytes) -> FfInbound | None:
    """Node からの 1 行のうち ff-* を読む。壊れた行・ff-* 以外・v の違う行・形の合わない行は None。"""
    if isinstance(line, bytes):
        if len(line) > MAX_LINE_BYTES:
            return None
        try:
            line = line.decode("utf-8")
        except UnicodeDecodeError:
            return None
    elif len(line.encode("utf-8")) > MAX_LINE_BYTES:
        return None
    t = line.strip()
    if not t:
        return None
    try:
        obj = json.loads(t)
    except ValueError:
        return None
    if not isinstance(obj, dict) or obj.get("v", VERSION) != VERSION:
        return None
    typ = obj.get("type")
    if typ == "ff-config":
        return FfInbound("ff-config", config=parse_ff_config(obj))
    if typ == "ff-line":
        ln = parse_ff_line(obj)
        return FfInbound("ff-line", line=ln) if ln is not None else None
    if typ == "ff-hide":
        return FfInbound("ff-hide")
    return None


# ---- ネイティブ → Node ----


def ff_key(action: str, press: int) -> str:
    return _line("ff-key", action=action, press=int(press))


def ff_drawn(press: int, seq: int, ms: float) -> str:
    return _line("ff-drawn", press=int(press), seq=int(seq), ms=round(max(0.0, float(ms)), 1))


def ff_keys(ok: bool, failed: list[str] | tuple[str, ...]) -> str:
    # 順は trigger・adopt・close に揃え、重ねない
    return _line("ff-keys", ok=bool(ok), failed=[a for a in ACTIONS if a in failed])


# ---- 行の窓の状態 ----


class StripState:
    """押下の番号・出ている行・「最初の行を描いた」を1押下に1回だけ知らせる、の状態。

    - on_key: 全体キー（表示中は close も）を受けたら押下の番号を1つ進め、その時刻（単調時計の秒）を覚える
    - on_line: 行を足す（reset なら前の行を消す）。その押下の最初の行なら「描けたら知らせる」待ちにする
    - on_drawn: 窓が実際に描かれたとき。待ちの押下ごとに ff-drawn の行を返す（1押下に1回）
    - hide: 行を消して隠す
    - overlay_keys_wanted: overlay-only のキー（既定は adopt・close）を取っておくべきか（行が出ていて、有効なときだけ）
    - accepts: 届いたキーを受けるか（overlay-only のキーは行が出ている間だけ。念のため届いた側でも落とす）
    """

    def __init__(self) -> None:
        self.press = 0
        self.lines: list[FfLine] = []
        self.visible = False
        self.enabled = True
        self._key_times: dict[int, float] = {}
        self._reported: set[int] = set()
        self._pending: list[tuple[int, int]] = []

    def on_key(self, action: str, now: float) -> int:
        self.press += 1
        self._key_times[self.press] = now
        for p in [p for p in self._key_times if p <= self.press - _KEEP_PRESSES]:
            self._key_times.pop(p, None)
            self._reported.discard(p)
        return self.press

    def key_time(self, press: int) -> float | None:
        return self._key_times.get(press)

    def on_line(self, line: FfLine) -> bool:
        """行を足す。窓が隠れていて、これで出すことになったら True。"""
        if line.reset:
            self.lines = []
        self.lines.append(line)
        if len(self.lines) > MAX_LINES:
            self.lines = self.lines[-MAX_LINES:]
        was_hidden = not self.visible
        self.visible = True
        p = line.press
        if p in self._key_times and p not in self._reported and all(q != p for q, _s in self._pending):
            self._pending.append((p, line.seq))
        return was_hidden

    def has_pending(self) -> bool:
        return bool(self._pending)

    def on_drawn(self, now: float) -> list[str]:
        """窓が描かれた。まだ知らせていない押下の最初の行について ff-drawn を返す。"""
        if not self.visible:
            return []
        out: list[str] = []
        for p, seq in self._pending:
            t = self._key_times.get(p)
            if t is None or p in self._reported:
                continue
            self._reported.add(p)
            out.append(ff_drawn(p, seq, (now - t) * 1000.0))
        self._pending = []
        return out

    def hide(self) -> bool:
        """隠す。出ていたら True。"""
        was = self.visible
        self.visible = False
        self.lines = []
        self._pending = []
        return was

    def overlay_keys_wanted(self) -> bool:
        return self.visible and self.enabled

    def accepts(self, action: str, cfg: FfConfig | None) -> bool:
        if cfg is None or not cfg.enabled or action not in ACTIONS:
            return False
        return cfg.is_global(action) or self.visible
