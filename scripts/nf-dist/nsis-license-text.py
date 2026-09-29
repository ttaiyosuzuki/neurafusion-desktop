#!/usr/bin/env python3
"""NSIS のインストーラ（SetCompressor /SOLID lzma）の中に、同意の画面の文が入っているかを見る。

   python3 scripts/nf-dist/nsis-license-text.py Setup.exe "MICROSOFT .NET LIBRARY" [ほかの文字列 ...]

同意の画面（MUI_PAGE_LICENSE）の文は圧縮した塊の先頭の方（見出しとページの資料）に入るので、先頭の 8 MB だけを
ほどいて、渡した文字列を UTF-8・UTF-16LE の両方で探す。全部あれば 0、足りなければ 1、形が違えば 2 で終わる。
verify-installers.sh が「Setup.exe に Microsoft の条件の同意の画面がある」を確かめるのに使う。
"""

import lzma
import struct
import sys

SIG = b"\xef\xbe\xad\xdeNullsoftInst"
LIMIT = 8 * 1024 * 1024


def main():
    data = open(sys.argv[1], "rb").read()
    wants = sys.argv[2:]
    at = data.find(SIG)
    if at < 4:
        print("NSIS の印が無い", file=sys.stderr)
        return 2
    start = at - 4 + 28  # firstheader: flags・siginfo・"NullsoftInst"・header の長さ・残りの長さ
    props = data[start : start + 5]
    lclppb, dict_size = props[0], struct.unpack_from("<I", props, 1)[0]
    if lclppb >= 9 * 5 * 5:
        print("SOLID の LZMA ではない", file=sys.stderr)
        return 2
    lc, lp, pb = lclppb % 9, (lclppb // 9) % 5, lclppb // 45
    dec = lzma.LZMADecompressor(
        format=lzma.FORMAT_RAW,
        filters=[{"id": lzma.FILTER_LZMA1, "dict_size": dict_size, "lc": lc, "lp": lp, "pb": pb}],
    )
    try:
        out = dec.decompress(data[start + 5 :], max_length=LIMIT)
    except lzma.LZMAError as e:
        print(f"ほどけない: {e}", file=sys.stderr)
        return 2
    missing = [w for w in wants if w.encode("utf-8") not in out and w.encode("utf-16-le") not in out]
    for w in missing:
        print(f"無い: {w}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
