#!/usr/bin/env bash
# FF「先読み」— engine/ff のバンドル（3面で同じ ESM 1本）を取り込む。
#   bash scripts/nf-ff/sync-engine.sh <neurafusion-171268ee の作業ツリー> [ref（既定 origin/main）]
# ref を一時の worktree に出し、engine/ff/build.mjs で作った ff-runtime.mjs を src/ff/engine/ff-runtime.js に置く。
# 約束の型（contract.ts）も同じ ref から取り込む。どちらも手で直さない。
set -euo pipefail
repo="${1:?neurafusion-171268ee の作業ツリーを指定してください}"
ref="${2:-origin/main}"
here="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d /tmp/nf-ff-sync.XXXXXX)"
cleanup() { git -C "$repo" worktree remove --force "$tmp/wt" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
sha="$(git -C "$repo" rev-parse --short "$ref")"
git -C "$repo" worktree add --detach "$tmp/wt" "$sha" >/dev/null 2>&1
ln -s "$repo/node_modules" "$tmp/wt/node_modules"
(cd "$tmp/wt" && node -e '
  import("./engine/ff/build.mjs").then(async (m) => {
    const r = await m.buildFfRuntime({ log: false, outfile: process.argv[1] });
    console.log("bytes=" + r.bytes + " inputs=" + r.inputs.length);
  });' "$tmp/ff-runtime.mjs")
dest="$here/src/ff/engine"
{
  printf '// @ts-nocheck\n// 取り込み元: neurafusion-171268ee %s の engine/ff（build.mjs で作ったバンドル）。手で直さない。\n// 取り込み: bash scripts/nf-ff/sync-engine.sh <repo> %s\n' "$sha" "$ref"
  cat "$tmp/ff-runtime.mjs"
} > "$dest/ff-runtime.js"
{
  printf '// 取り込み元: neurafusion-171268ee engine/ff/contract.ts（%s）。手で直さない。\n// 差し替えは scripts/nf-ff/sync-engine.sh（engine/ff のバンドルと一緒に入れる）。\n\n' "$sha"
  git -C "$repo" show "$sha:engine/ff/contract.ts"
} > "$dest/contract.ts"
echo "synced=$sha"
