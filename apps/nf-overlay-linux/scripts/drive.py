#!/usr/bin/python3
"""VM での確認用: Node の代わりに nf-overlay を起動し、config を渡し、出てきた行を記録する。

    drive.py --config cfg.json --out lines.jsonl [--fifo /tmp/nf-drive.fifo]

- 記録には本文を残さない。read の text は、文字数と「入力欄の文字が混ざっていないか」「答えの一部が入っているか」の真偽だけにする
- --fifo に 1 行 JSON を書くと、そのまま nf-overlay へ送る（get-read-log・config の送り直し・stop）
"""

import argparse
import json
import os
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BIN = os.path.join(HERE, "..", "nf-overlay")
ANSWER_PROBES = ("用途地域", "運転資金", "競合店", "fake")


def redact(obj):
    if obj.get("type") == "read" and "text" in obj:
        t = obj.pop("text")
        obj["textProbe"] = {
            "chars": len(t),
            "hasInputSecret": "INPUT-SECRET" in t or "入力中の下書き" in t,
            "hasAnswer": any(p in t for p in ANSWER_PROBES),
            # 丸自身のパネル（未接続の表示）が写り込んでいないか
            "hasPanelText": "検品パネル" in t or "未接続" in t,
        }
    return obj


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fifo")
    a = ap.parse_args()
    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    p = subprocess.Popen([BIN], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr, text=True, bufsize=1)
    out = open(a.out, "a", encoding="utf-8")

    def send(obj):
        p.stdin.write(json.dumps(obj, ensure_ascii=False) + "\n")
        p.stdin.flush()

    def pump():
        for line in p.stdout:
            try:
                obj = json.loads(line)
            except ValueError:
                continue
            obj = redact(obj)
            obj["_at"] = round(time.time(), 3)
            out.write(json.dumps(obj, ensure_ascii=False) + "\n")
            out.flush()

    threading.Thread(target=pump, daemon=True).start()
    send(cfg)
    if a.fifo:
        if not os.path.exists(a.fifo):
            os.mkfifo(a.fifo)

        def relay():
            while p.poll() is None:
                with open(a.fifo, encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                send(json.loads(line))
                            except (ValueError, BrokenPipeError):
                                pass

        threading.Thread(target=relay, daemon=True).start()
    code = p.wait()
    out.write(json.dumps({"type": "_exit", "code": code, "_at": round(time.time(), 3)}) + "\n")
    out.close()


if __name__ == "__main__":
    main()
