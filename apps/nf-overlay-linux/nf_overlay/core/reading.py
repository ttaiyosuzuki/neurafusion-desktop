"""押すまで読まない門・押した1回の読み取りの手順・「読めた・読めない」の数（Windows の ReadGate/ReadPlanner/ReadLog と同じ規則）。

読み取りの部品（AT-SPI・撮影＋文字認識）は呼ぶ側から渡す。ここは OS に依存しない。
"""

from __future__ import annotations

import json
import threading
import time
from dataclasses import dataclass, field, replace
from typing import Any, Callable, Protocol as TypingProtocol

from .protocol import OverlayConfig, Reason, MAX_TEXT_CHARS
from . import protocol

TICKET_LIFETIME_S = 10.0


class ReadTicket:
    """丸が押された印。ReadGate だけが作る（読み取りの部品はこれが無いと動かない）。"""

    __slots__ = ("serial", "app", "window", "issued_at")

    def __init__(self, serial: int, app: str, window: int, issued_at: float, _key: object) -> None:
        if _key is not _GATE_KEY:
            raise PermissionError("ReadTicket は ReadGate.on_click だけが作る")
        self.serial = serial
        self.app = app
        self.window = window
        self.issued_at = issued_at


_GATE_KEY = object()


class ReadGate:
    """押した1回につき、読み取りの開始を1回だけ許す。印は 10 秒で切れる。"""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._serial = 0
        self._pending: ReadTicket | None = None

    def on_click(self, app: str | None, window: int) -> ReadTicket | None:
        # Wayland ではウィンドウが分からないので window=0・app="*" で押す（固定の丸は画面を1枚撮るだけ）
        if not app:
            return None
        with self._lock:
            self._serial += 1
            self._pending = ReadTicket(self._serial, app, window, self._clock(), _GATE_KEY)
            return self._pending

    def try_consume(self, ticket: ReadTicket | None, window: int) -> bool:
        if ticket is None:
            return False
        with self._lock:
            if self._pending is not ticket:
                return False
            self._pending = None
            if ticket.window != window:
                return False
            age = self._clock() - ticket.issued_at
            return 0 <= age <= TICKET_LIFETIME_S

    def reset(self) -> None:
        with self._lock:
            self._pending = None


@dataclass(frozen=True)
class AppReadStats:
    atspi_ok: int = 0
    atspi_ng: int = 0
    ocr_ok: int = 0
    ocr_ng: int = 0
    last_method: str | None = None
    last_ok: bool | None = None

    @property
    def status(self) -> str:
        if self.atspi_ok:
            return "atspi"
        if self.ocr_ok:
            return "ocr"
        if self.atspi_ng + self.ocr_ng:
            return "unreadable"
        return "untested"


class ReadLog:
    """読めた・読めないの数。ファイルに保存しても数だけで、生の文字は書かない。"""

    def __init__(self) -> None:
        self._apps: dict[str, AppReadStats] = {}
        self._lock = threading.Lock()

    def get(self, app: str) -> AppReadStats:
        with self._lock:
            return self._apps.get(app, AppReadStats())

    def record(self, app: str, method: str, ok: bool) -> None:
        with self._lock:
            s = self._apps.get(app, AppReadStats())
            if method == "atspi":
                s = replace(s, atspi_ok=s.atspi_ok + 1) if ok else replace(s, atspi_ng=s.atspi_ng + 1)
            else:
                s = replace(s, ocr_ok=s.ocr_ok + 1) if ok else replace(s, ocr_ng=s.ocr_ng + 1)
            self._apps[app] = replace(s, last_method=method, last_ok=ok)

    def preferred(self, app: str) -> str:
        """AT-SPI で一度も読めず、OCR では読めたことがあるアプリだけ OCR から試す。"""
        s = self.get(app)
        return "ocr" if s.atspi_ok == 0 and s.atspi_ng > 0 and s.ocr_ok > 0 else "atspi"

    def to_wire(self) -> dict[str, Any]:
        with self._lock:
            return {
                k: {
                    "atspiOk": s.atspi_ok,
                    "atspiNg": s.atspi_ng,
                    "ocrOk": s.ocr_ok,
                    "ocrNg": s.ocr_ng,
                    "status": s.status,
                    **({"lastMethod": s.last_method} if s.last_method else {}),
                    **({"lastOk": s.last_ok} if s.last_ok is not None else {}),
                }
                for k, s in sorted(self._apps.items())
            }

    def to_json(self) -> str:
        return json.dumps({"v": 1, "apps": self.to_wire()}, ensure_ascii=False)

    @classmethod
    def from_json(cls, raw: str | None) -> "ReadLog":
        log = cls()
        try:
            obj = json.loads(raw or "")
            apps = obj.get("apps", {}) if isinstance(obj, dict) else {}
            for k, v in apps.items():
                if not isinstance(k, str) or not isinstance(v, dict):
                    continue

                def n(key: str) -> int:
                    x = v.get(key)
                    return x if isinstance(x, int) and not isinstance(x, bool) and x >= 0 else 0

                log._apps[k] = AppReadStats(n("atspiOk"), n("atspiNg"), n("ocrOk"), n("ocrNg"))
        except (ValueError, AttributeError):
            return cls()
        return log


class Reader(TypingProtocol):
    method: str

    def read(self, window: int) -> str | None: ...


@dataclass
class ReadOutcome:
    app: str
    text: str | None
    attempts: list[dict[str, Any]] = field(default_factory=list)
    reason: str | None = None
    allowed: bool = True

    @property
    def ok(self) -> bool:
        return self.text is not None

    @property
    def method(self) -> str:
        return next((a["method"] for a in self.attempts if a["ok"]), "none")

    def protocol_line(self) -> str | None:
        """押していない（門を通らなかった）ときは何も出さない。"""
        if not self.allowed:
            return None
        return protocol.read(self.app, self.method, self.ok, self.text, self.reason, self.attempts)


class ReadPlanner:
    """門を通す → 記録から最初の方法を決める → 読めなければもう片方（OCR は毎回同意を取る）→ 数を記録する。

    同意を断られた・読み取りがオフ・ポータルで断られたときは「読めない」とは記録しない（アプリのせいではない）。
    """

    def __init__(self, gate: ReadGate, log: ReadLog) -> None:
        self.gate = gate
        self.log = log

    def run(
        self,
        ticket: ReadTicket | None,
        window: int,
        config: OverlayConfig,
        atspi: Reader | None,
        ocr: Reader | None,
        ask_consent: Callable[[str], bool] | None,
    ) -> ReadOutcome:
        app_id = ticket.app if ticket else ""
        if not self.gate.try_consume(ticket, window):
            return ReadOutcome(app_id, None, allowed=False)
        app = config.app(app_id)
        mode = app.read if app else "ax-then-ocr"
        if mode == "off":
            return ReadOutcome(app_id, None, reason=Reason.READ_OFF)
        if mode == "ax-only":
            order = ["atspi"]
        elif self.log.preferred(app_id) == "ocr":
            order = ["ocr", "atspi"]
        else:
            order = ["atspi", "ocr"]
        attempts: list[dict[str, Any]] = []
        last_reason: str | None = None
        for method in order:
            reader = atspi if method == "atspi" else ocr
            if reader is None:
                continue
            if method == "ocr" and config.ocr_ask_each_time:
                yes = bool(ask_consent and ask_consent(app_id))
                if not yes:
                    last_reason = Reason.CONSENT_DECLINED
                    continue
            text: str | None = None
            failed = False
            denied = False
            try:
                text = reader.read(window)
            except ScreenDenied:
                denied = True
            except Exception:  # noqa: BLE001 — 例外の中身は他のアプリの文字を含みうるので残さない
                failed = True
            trimmed = (text or "").strip()
            if len(trimmed) > MAX_TEXT_CHARS:
                trimmed = trimmed[-MAX_TEXT_CHARS:]
            ok = not failed and not denied and len(trimmed) >= config.min_chars
            if ok:
                reason = None
            elif denied:
                reason = Reason.SCREEN_DENIED
            elif method == "atspi":
                reason = Reason.ATSPI_ERROR if failed else Reason.ATSPI_EMPTY
            else:
                reason = Reason.OCR_ERROR if failed else Reason.OCR_EMPTY
            attempts.append({"method": method, "ok": ok, "chars": len(trimmed), **({"reason": reason} if reason else {})})
            if not denied:
                self.log.record(app_id, method, ok)
            if ok:
                return ReadOutcome(app_id, trimmed, attempts)
            last_reason = reason
        return ReadOutcome(app_id, None, attempts, last_reason)


class ScreenDenied(Exception):
    """画面の撮影を OS（xdg-desktop-portal）で断られた。"""
