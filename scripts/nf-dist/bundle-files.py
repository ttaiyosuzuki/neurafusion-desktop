#!/usr/bin/env python3
""".NET の単一ファイル（PublishSingleFile）の目録に入っているファイルの名前を 1 行ずつ出す。

   python3 scripts/nf-dist/bundle-files.py nf-overlay.exe

verify-installers.sh が「丸の本体に WPF の使っていないネイティブ DLL が入っていない」を確かめるのに使う
（中身は圧縮されていることがあるので、文字列の検索ではなく目録を読む）。
形式: dotnet/runtime src/installer/managed/Microsoft.NET.HostModel/Bundle（BundleManifest・FileEntry）。
目録が無い・読めないときは 2 で終わる。
"""

import struct
import sys

# ".net core bundle" の SHA-256。単一ファイルの実行部分は、この印の直前 8 バイトに目録の位置を持つ
MARKER = bytes.fromhex("8b1202b96a612038727b930214d7a03213f5b9e6efae3318ee3b2dce24b36aae")


def read_string(buf, pos):
    # BinaryWriter.Write(string): 7 ビットずつの長さ＋UTF-8
    length, shift = 0, 0
    while True:
        b = buf[pos]
        pos += 1
        length |= (b & 0x7F) << shift
        if b < 0x80:
            break
        shift += 7
    return buf[pos : pos + length].decode("utf-8"), pos + length


def main():
    data = open(sys.argv[1], "rb").read()
    at = data.find(MARKER)
    if at < 8:
        print("単一ファイルの印が無い", file=sys.stderr)
        return 2
    (header,) = struct.unpack_from("<q", data, at - 8)
    if header <= 0 or header >= len(data):
        print("目録の位置が無い（単一ファイルとして書き出されていない）", file=sys.stderr)
        return 2
    major, _minor, count = struct.unpack_from("<IIi", data, header)
    pos = header + 12
    _bundle_id, pos = read_string(data, pos)
    if major >= 2:
        pos += 8 * 5  # deps.json と runtimeconfig.json の位置・大きさ、flags
    for _ in range(count):
        pos += 8 * 2  # offset, size
        if major >= 6:
            pos += 8  # compressedSize
        pos += 1  # type
        name, pos = read_string(data, pos)
        print(name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
