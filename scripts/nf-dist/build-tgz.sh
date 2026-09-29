#!/usr/bin/env bash
# NeuraFusion Desktop 配布形式（DK-09）— 配布物に同梱する本体の npm tarball を作る（約 25 分）。
#
#   bash scripts/nf-dist/build-tgz.sh [--skip-build]   # 出力: .artifacts/nf-dist-pack/neurafusion-<版>.tgz
#
# 梱包は必ず --pnpm-pack（npm pack だと bundleDependencies の @openclaw/ai が同梱されない）。
# 出来た物も require_tgz と同じ検査（@openclaw/ai が入っているか）にかけ、入っていなければ止まる。
# 出力先を docker e2e の既定（.artifacts/docker-e2e-package）と分け、そちらの npm pack に消されないようにする。
set -euo pipefail
source "$(dirname "$0")/common.sh"

PACK_DIR="$ROOT_DIR/.artifacts/nf-dist-pack"
node "$ROOT_DIR/scripts/package-openclaw-for-docker.mjs" \
  --allow-unreleased-changelog --pnpm-pack --output-dir "$PACK_DIR" "$@"

OUT="$PACK_DIR/$PACKAGE_NAME-$VERSION.tgz"
[ -f "$OUT" ] || { echo "tarball ができていません: $OUT" >&2; exit 1; }
tgz_has_ai_runtime "$OUT" || { echo "@openclaw/ai が入っていません: $OUT" >&2; exit 1; }
echo "==> $OUT  $(du -h "$OUT" | awk '{print $1}')  sha256=$(sha256_of "$OUT")"
