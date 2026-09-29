// VM での確認用: `overlay start` と同じ順（currentPlatform → loadSettings → resolveNativeBinary → startOverlayHost）で
// Node 側から丸を起動する。CLI 全体は VM で組み立てないので、この 1 本だけを esbuild でまとめて Linux の Node で動かす:
//   node_modules/.bin/esbuild apps/nf-overlay-linux/scripts/vm-node-host.ts --bundle --platform=node --format=esm \
//     --outfile=/tmp/nf-linux-vm/share/vm-node-host.mjs
//   （VM で）NF_OVERLAY_BIN=…/nf-overlay node vm-node-host.mjs <秒>
// ログに出るのは host.ts のログ（本文は出さない）と、受け取った行の種類の数だけ。<秒> たったら止める。
import { currentPlatform, realHostDeps, resolveNativeBinary, startOverlayHost } from "../../../src/overlay/host.js";
import { loadSettings } from "../../../src/overlay/settings.js";

const seconds = Number(process.argv[2] ?? "60");
const platform = currentPlatform();
if (!platform) {
  throw new Error("右下の丸は macOS・Windows・Linux だけです");
}
const settings = await loadSettings();
const binary = resolveNativeBinary(platform);
if (!binary) {
  throw new Error("丸の本体（Linux）が見つかりません（NF_OVERLAY_BIN を指定）");
}
const host = startOverlayHost({ binary, platform, settings, deps: realHostDeps((l) => console.log(`[host] ${l}`)) });
console.log(`[e2e] platform=${platform} apps=${host.config.apps.map((a) => `${a.id}:${a.linux.join("|")}`).join(",") || "(なし)"}`);
const timer = setTimeout(() => host.stop(), seconds * 1000);
const code = await host.exited;
clearTimeout(timer);
const kinds: Record<string, number> = {};
for (const m of host.seen) {
  kinds[m.type] = (kinds[m.type] ?? 0) + 1;
}
console.log(`[e2e] exited=${code} seen=${JSON.stringify(kinds)}`);
