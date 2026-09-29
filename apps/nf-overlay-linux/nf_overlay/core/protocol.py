"""NF 右下の丸 — Node ⇄ ネイティブの約束（docs/overlay-protocol.md）の Linux 版の読み書き。

OS の部品（GTK・AT-SPI・X11）に依存しない。Mac・Windows と同じ形の 1 行 JSON を扱い、
Windows 版で足した 7 点（docs/overlay-windows.md）も同じ形で受ける・出す。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

VERSION = 1
MAX_LINE_BYTES = 1024 * 1024
# 読んだ文字は末尾のこの字数まで（Windows 版と同じ）
MAX_TEXT_CHARS = 20_000

READ_MODES = ("ax-then-ocr", "ax-only", "off")
# 別名（Windows の uia・Linux の atspi）は同じ意味で受ける
_READ_ALIASES = {
    "ax-then-ocr": "ax-then-ocr",
    "uia-then-ocr": "ax-then-ocr",
    "atspi-then-ocr": "ax-then-ocr",
    "ax-only": "ax-only",
    "uia-only": "ax-only",
    "atspi-only": "ax-only",
    "off": "off",
}


class Reason:
    ATSPI_EMPTY = "atspi-empty"
    ATSPI_ERROR = "atspi-error"
    OCR_EMPTY = "ocr-empty"
    OCR_ERROR = "ocr-error"
    SCREEN_DENIED = "screen-denied"
    CONSENT_DECLINED = "consent-declined"
    READ_OFF = "read-off"


@dataclass(frozen=True)
class AppConfig:
    id: str
    label: str
    linux: tuple[str, ...]
    enabled: bool
    read: str


@dataclass(frozen=True)
class OverlayConfig:
    apps: tuple[AppConfig, ...] = ()
    enabled: bool = True
    panel_url: str | None = None
    panel_mode: str = "disconnected"
    ocr_ask_each_time: bool = True
    size: int = 44
    margin: int = 16
    min_chars: int = 1

    def match(self, wm_names: list[str] | tuple[str, ...]) -> AppConfig | None:
        """WM_CLASS の名前（instance, class の順）から対応アプリを探す。小文字で比較。
        instance が一致するアプリを先に選ぶ（class は同じ会社の別アプリで重なることがあるため）。"""
        for n in wm_names:
            n = (n or "").lower()
            if not n:
                continue
            for a in self.apps:
                if n in a.linux:
                    return a
        return None

    def app(self, app_id: str) -> AppConfig | None:
        return next((a for a in self.apps if a.id == app_id), None)


@dataclass(frozen=True)
class Inbound:
    type: str
    config: OverlayConfig | None = None
    text: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def is_allowed_panel_url(u: str) -> bool:
    """https、または手元（127.0.0.1・localhost）の http だけ（Node 側の isAllowedPanelUrl と同じ）。"""
    try:
        p = urlparse(u)
    except ValueError:
        return False
    if p.scheme == "https" and p.hostname:
        return True
    return p.scheme == "http" and p.hostname in ("127.0.0.1", "localhost")


def _int(v: Any, default: int, lo: int, hi: int) -> int:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return default
    return max(lo, min(hi, int(v)))


def _names(v: Any) -> tuple[str, ...]:
    # 配列、または {"wmClass":[…]} の形（Windows の {"exe":[…]} に合わせた別の形）
    if isinstance(v, dict):
        v = v.get("wmClass") or v.get("wm_class") or []
    if not isinstance(v, list):
        return ()
    return tuple(s.strip().lower() for s in v if isinstance(s, str) and s.strip())


def parse_config(obj: dict[str, Any]) -> OverlayConfig:
    apps: list[AppConfig] = []
    for a in obj.get("apps") or []:
        if not isinstance(a, dict) or not isinstance(a.get("id"), str) or not a["id"]:
            continue
        apps.append(
            AppConfig(
                id=a["id"],
                label=a.get("label") if isinstance(a.get("label"), str) else a["id"],
                linux=_names(a.get("linux")),
                enabled=a.get("enabled") is not False,
                read=_READ_ALIASES.get(a.get("read"), "ax-then-ocr"),
            )
        )
    url = obj.get("panelUrl")
    url = url if isinstance(url, str) and is_allowed_panel_url(url) else None
    mode = "url" if obj.get("panelMode") == "url" and url else "disconnected"
    return OverlayConfig(
        apps=tuple(apps),
        enabled=obj.get("enabled") is not False,
        panel_url=url,
        panel_mode=mode,
        # 今の約束は "ask-each-time" だけ。知らない値でも毎回聞く側に倒す
        ocr_ask_each_time=True,
        size=_int(obj.get("size"), 44, 16, 128),
        margin=_int(obj.get("margin"), 16, 0, 200),
        min_chars=_int(obj.get("minChars"), 1, 1, 10_000),
    )


def parse_inbound(line: str | bytes) -> Inbound | None:
    """Node からの 1 行を読む。壊れた行・知らない type・v の違う行は None（読み飛ばす）。"""
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
    if not isinstance(obj, dict):
        return None
    v = obj.get("v", VERSION)
    if v != VERSION:
        return None
    typ = obj.get("type")
    if typ == "config":
        return Inbound("config", config=parse_config(obj))
    if typ == "stop":
        return Inbound("stop")
    if typ == "panel-text":
        text = obj.get("text")
        return Inbound("panel-text", text=text if isinstance(text, str) else "")
    if typ in ("get-read-log", "getReadLog"):
        return Inbound("get-read-log")
    return None


# ---- ネイティブ → Node ----


def _line(typ: str, **fields: Any) -> str:
    body = {"v": VERSION, "type": typ}
    body.update({k: v for k, v in fields.items() if v is not None})
    return json.dumps(body, ensure_ascii=False, separators=(",", ":"))


def _rect(r: Any) -> dict[str, int]:
    return {"x": int(r.x), "y": int(r.y), "w": int(r.w), "h": int(r.h)}


def ready(session: str, ax: bool, screen: bool, ocr: bool, version: str) -> str:
    return _line("ready", platform="linux", session=session, ax=ax, screen=screen, ocr=ocr, version=version)


def geometry(app: str, window: Any, dot: Any, scale: float = 1.0, fixed: bool = False) -> str:
    # 座標は左上原点の論理座標。px は物理ピクセル（Windows と同じ足し方）
    px = {"window": _rect(window.scaled(scale)), "dot": _rect(dot.scaled(scale))}
    return _line(
        "geometry",
        app=app,
        window=_rect(window),
        dot=_rect(dot),
        scale=scale,
        px=px,
        fixed=True if fixed else None,
    )


def hidden(reason: str, detail: str | None = None, app: str | None = None) -> str:
    return _line("hidden", reason=reason, detail=detail, app=app)


def clicked(app: str) -> str:
    return _line("clicked", app=app)


def read(app: str, method: str, ok: bool, text: str | None, reason: str | None, attempts: list[dict[str, Any]]) -> str:
    chars = len(text) if ok and text is not None else 0
    return _line(
        "read",
        app=app,
        method=method,
        ok=ok,
        chars=chars,
        reason=None if ok else reason,
        attempts=attempts,
        # 本文は ok のときだけ
        text=text if ok else None,
    )


def panel(open_: bool, mode: str) -> str:
    return _line("panel", open=open_, mode=mode)


def error(code: str, message: str) -> str:
    return _line("error", code=code, message=message)


def read_log(apps: dict[str, Any]) -> str:
    return _line("read-log", apps=apps)
