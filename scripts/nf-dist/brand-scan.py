#!/usr/bin/env python3
# NeuraFusion Desktop 配布形式（DK-09）— 利用者に見える所に、上流の名前・旧名・ロブスターの絵文字が無いかを数える。
# verify-installers.sh から使う（オーナー方針: OpenClaw・fork は画面に書かない。出てよいのはライセンス文書の中だけ）。
#
#   python3 scripts/nf-dist/brand-scan.py <ファイル>...          # UTF-8（ASCII を含む）と UTF-16LE（Windows の版情報など）で探す
#   python3 scripts/nf-dist/brand-scan.py --nsis <Setup.exe>     # NSIS の圧縮された見出し（画面の文言・「アプリと機能」の
#                                                               # 表示名と発行元・ショートカット名）を展開して探す
#
# 見つからなければ何も出さず 0。見つかれば「件数 ファイル: 最初の行」を出して 1。読めなければ 2。
import lzma
import re
import struct
import sys

# 上流の名前（OpenClaw）・旧名（Clawdbot・Moltbot・Clawd）・上流のサービス名（ClawHub）。大文字小文字は問わない
WORDS = ["openclaw", "clawdbot", "moltbot", "clawd", "clawhub"]
LOBSTER = "\U0001F99E"
PATTERN = re.compile("|".join(WORDS + [LOBSTER]), re.IGNORECASE)


def bytes_pattern(encoding: str) -> "re.Pattern[bytes]":
    """同じ語と絵文字を、その文字コードのバイト列のまま探すパターン（大きな実行ファイルを文字に直さずに見る）。"""

    def any_case(word: str) -> bytes:
        return b"".join(
            b"(?:" + re.escape(c.lower().encode(encoding)) + b"|" + re.escape(c.upper().encode(encoding)) + b")"
            for c in word
        )

    return re.compile(b"|".join([any_case(w) for w in WORDS] + [re.escape(LOBSTER.encode(encoding))]))


BYTE_PATTERNS = [(enc, bytes_pattern(enc)) for enc in ("utf-8", "utf-16-le")]


def nsis_header_text(data: bytes) -> str:
    """NSIS 3（Unicode・LZMA）のインストーラの見出しを展開し、UTF-16LE の文字として返す。"""
    i = data.find(b"\xef\xbe\xad\xdeNullsoftInst")
    if i < 4:
        raise ValueError("NSIS の印が無い")
    first = i - 4
    header_len, _ = struct.unpack_from("<II", data, first + 20)
    p = first + 28
    props = data[p : p + 5]
    if props[0] >= 9 * 5 * 5:
        raise ValueError("LZMA ではない（SetCompressor lzma で作った物だけ読める）")
    lc, rest = props[0] % 9, props[0] // 9
    lp, pb = rest % 5, rest // 5
    (dict_size,) = struct.unpack_from("<I", props, 1)
    dec = lzma.LZMADecompressor(
        format=lzma.FORMAT_RAW,
        filters=[{"id": lzma.FILTER_LZMA1, "lc": lc, "lp": lp, "pb": pb, "dict_size": dict_size}],
    )
    out = dec.decompress(data[p + 5 : p + 5 + 8_000_000], max_length=header_len + 4)
    (n,) = struct.unpack_from("<I", out, 0)
    return out[4 : 4 + min(n, header_len)].decode("utf-16-le", errors="replace")


def hit_lines(data: bytes, nsis: bool):
    """見つかった所の前後の 1 行（120 文字まで）を返す。"""
    if nsis:
        text = nsis_header_text(data)
        for m in PATTERN.finditer(text):
            start = text.rfind("\n", 0, m.start()) + 1
            end = text.find("\n", m.end())
            yield text[start : end if end >= 0 else len(text)].strip()[:120]
        return
    for enc, pat in BYTE_PATTERNS:
        nl = "\n".encode(enc)
        for m in pat.finditer(data):
            lo, hi = max(0, m.start() - 400), min(len(data), m.end() + 400)
            start = data.rfind(nl, lo, m.start())
            start = lo if start < 0 else start + len(nl)
            end = data.find(nl, m.end(), hi)
            end = hi if end < 0 else end
            if enc == "utf-16-le" and (m.start() - start) % 2:
                start += 1
            yield data[start:end].decode(enc, errors="replace").strip()[:120]


def main(argv: list) -> int:
    nsis = False
    if argv and argv[0] == "--nsis":
        nsis, argv = True, argv[1:]
    if not argv:
        print("使い方: brand-scan.py [--nsis] <ファイル>...", file=sys.stderr)
        return 2
    found = 0
    for path in argv:
        try:
            with open(path, "rb") as f:
                hits = list(hit_lines(f.read(), nsis))
        except (OSError, ValueError, lzma.LZMAError, struct.error) as e:
            print(f"読めない {path}: {e}")
            return 2
        if hits:
            found += len(hits)
            print(f"{len(hits)} {path}: {hits[0]}")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
