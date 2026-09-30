#!/usr/bin/env python3
# NeuraFusion Desktop 配布形式（DK-09）— 利用者に見える所に、上流の名前・旧名・ロブスターの絵文字が無いかを数える。
# verify-installers.sh から使う（オーナー方針: OpenClaw・fork は画面に書かない。出てよいのはライセンス文書の中だけ）。
#
#   python3 scripts/nf-dist/brand-scan.py <ファイル>...          # UTF-8（ASCII を含む）と UTF-16LE（Windows の版情報など）で探す
#   python3 scripts/nf-dist/brand-scan.py --nsis <Setup.exe>     # NSIS の圧縮された見出し（画面の文言・「アプリと機能」の
#                                                               # 表示名と発行元・ショートカット名）を展開して探す
#   python3 scripts/nf-dist/brand-scan.py --commands <ファイル>...  # CLI の出力（サブコマンドの --help・案内）に、利用者が打つ
#                                                               # コマンドとしての `openclaw …`（Usage・例・「openclaw doctor を」）と
#                                                               # ロブスターが無いか。パス・パッケージ名・URL・環境変数は数えない
#                                                               # （packages/terminal-core/src/cli-display-name.ts と同じ決まり）
#   python3 scripts/nf-dist/brand-scan.py --ui <ファイル>...        # 管理画面の組み立て済みの JS・CSS に「Ask OpenClaw」・ロブスターの
#                                                               # 絵文字・ロブスターのアイコン（SVG の形）が無いか
#   python3 scripts/nf-dist/brand-scan.py --allow <許可リスト.json> <ファイル>...
#                                                               # UTF-8 の文字として読み、許可リストの名前（理由つき。
#                                                               # brand-allow-help.json）を除いてから探す（CLI の --help 用）
#
# 見つからなければ何も出さず 0（--allow のときは「許可 N 件（名前 件数・…）」を出す）。見つかれば「件数 ファイル: 最初の行」を
# 出して 1。読めない・許可リストに理由の無い項目があるときは 2。
import json
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

# --commands: コマンドとしての `openclaw`。前は行頭・空白・引用符や括弧・色の指定、後ろは空白＋語・オプション・<…>・[…]、
# 閉じのバッククォート、色の指定。npx・pnpm などの後ろ（別のパッケージを取りに行く書き方）は数えない
COMMAND_BEFORE = re.compile(r"(?:^|[\s`'\"(\[{<>:=,;|&]|\x1b\[[0-9;]*m)$")
COMMAND_RUNNER = re.compile(r"(?:\bnpx|\bbunx|\bdlx|\bexec|\bpnpm|\bnpm|\byarn)[ \t]+$")
COMMAND_AFTER = re.compile(r"[ \t]+(?:--?[A-Za-z]|[a-z<\[])|`|\x1b\[")
# --ui: 管理画面に出る「Ask OpenClaw」・ロブスターの絵文字・ロブスターのアイコン（icons.lobster と環境の色つき favicon の胴の形）。
# 文言の中の `openclaw …` は数えない（Gateway から来る値との比較 new-session/discovery.ts が同じ形で残るため）
UI_PATTERN = re.compile(r"Ask OpenClaw|" + LOBSTER + r"|M60 10C30 10 15 35 15 55")


def command_hits(text: str):
    """コマンドとしての openclaw（と ロブスター）の行を返す。"""
    for m in re.finditer("openclaw|" + LOBSTER, text):
        if m.group(0) == "openclaw":
            before = text[max(0, m.start() - 40) : m.start()]
            if not COMMAND_BEFORE.search(before) or COMMAND_RUNNER.search(before):
                continue
            if not COMMAND_AFTER.match(text, m.end()):
                continue
        start = text.rfind("\n", 0, m.start()) + 1
        end = text.find("\n", m.end())
        yield text[start : end if end >= 0 else len(text)].strip()[:120]


def ui_hits(text: str):
    """管理画面の JS・CSS で見つかった所の前後 50 文字を返す（1 行が長いので行ではなく前後）。"""
    for m in UI_PATTERN.finditer(text):
        yield text[max(0, m.start() - 50) : m.end() + 50].replace("\n", " ")


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


def load_allow(path: str) -> list:
    """許可リストを読む。name・pattern・reason のどれかが空の項目があれば ValueError（理由の無い許可を入れさせない）。"""
    with open(path, encoding="utf-8") as f:
        items = json.load(f)["allow"]
    allow = []
    for i, item in enumerate(items, 1):
        if not all(str(item.get(k, "")).strip() for k in ("name", "pattern", "reason")):
            raise ValueError(f"許可リストの {i} 番目に name・pattern・reason のどれかが無い")
        allow.append((item["name"], re.compile(item["pattern"])))
    return allow


def mask_allowed(text: str, allow: list, counts: dict) -> str:
    """許可した名前を同じ長さの空白に置き換え、名前ごとの件数を counts に足す（行の位置は変えない）。"""
    for name, pat in allow:

        def blank(m: "re.Match[str]", name: str = name) -> str:
            counts[name] = counts.get(name, 0) + 1
            return " " * len(m.group(0))

        text = pat.sub(blank, text)
    return text


def text_hits(text: str, allow: list, counts: dict):
    """文字として探す。見つかった所の 1 行（120 文字まで。許可した名前も含めて元のまま）を返す。"""
    for m in PATTERN.finditer(mask_allowed(text, allow, counts)):
        start = text.rfind("\n", 0, m.start()) + 1
        end = text.find("\n", m.end())
        yield text[start : end if end >= 0 else len(text)].strip()[:120]


def hit_lines(data: bytes, nsis: bool, allow: list, counts: dict):
    """見つかった所の前後の 1 行（120 文字まで）を返す。"""
    if nsis:
        yield from text_hits(nsis_header_text(data), allow, counts)
        return
    if allow:
        yield from text_hits(data.decode("utf-8", errors="replace"), allow, counts)
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
    nsis, allow_path, mode = False, None, None
    if argv and argv[0] in ("--commands", "--ui"):
        mode, argv = argv[0], argv[1:]
    elif argv and argv[0] == "--nsis":
        nsis, argv = True, argv[1:]
    elif len(argv) >= 2 and argv[0] == "--allow":
        allow_path, argv = argv[1], argv[2:]
    if not argv:
        print("使い方: brand-scan.py [--nsis | --commands | --ui | --allow <許可リスト.json>] <ファイル>...", file=sys.stderr)
        return 2
    try:
        allow = load_allow(allow_path) if allow_path else []
    except (OSError, ValueError, KeyError, TypeError, re.error) as e:
        print(f"許可リストを読めない {allow_path}: {e}")
        return 2
    found, counts = 0, {}
    for path in argv:
        try:
            with open(path, "rb") as f:
                data = f.read()
            if mode:
                text = data.decode("utf-8", errors="replace")
                hits = list(command_hits(text) if mode == "--commands" else ui_hits(text))
            else:
                hits = list(hit_lines(data, nsis, allow, counts))
        except (OSError, ValueError, lzma.LZMAError, struct.error) as e:
            print(f"読めない {path}: {e}")
            return 2
        if hits:
            found += len(hits)
            print(f"{len(hits)} {path}: {hits[0]}")
    if found:
        return 1
    if allow_path:
        print(f"許可 {sum(counts.values())} 件（" + "・".join(f"{k} {v}" for k, v in counts.items()) + "）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
