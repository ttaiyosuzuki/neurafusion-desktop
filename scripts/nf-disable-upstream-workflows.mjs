#!/usr/bin/env node
/**
 * nf-disable-upstream-workflows.mjs
 *
 * ★何のための道具か
 *   このリポジトリには上流から来た workflow が 105 本あります（cron 21・push 27）。
 *   フォークで暴発するのを避けるため、**リポジトリ設定で Actions 全体を止めて**あります。
 *   しかし .dmg を CI で作るには Actions を有効にする必要があり、
 *   有効にした瞬間に **105 本すべてが動き出します**。
 *
 *   そこでこの道具は、Actions を有効にしたあと、**残したい workflow 以外を1本ずつ止めます**。
 *   GitHub には「この workflow だけ許す」設定がないので、個別に止めるしかありません。
 *
 * ★ファイルは消しません。
 *   コードから 191 箇所参照されているものがあり、消すと壊れます。
 *   止めるのは「動かす／動かさない」の状態だけです。
 *
 * 使い方:
 *   node scripts/nf-disable-upstream-workflows.mjs            # 何を止めるかを出すだけ
 *   node scripts/nf-disable-upstream-workflows.mjs --apply    # 実際に止める
 *
 * ★順番（逆にしないこと）
 *   1. この道具を **--apply なし** で走らせ、止める一覧を目で見る
 *   2. リポジトリ設定で Actions を有効にする
 *   3. すぐにこの道具を --apply で走らせる
 *   4. nf-build-mac だけが有効になっていることを確かめる
 */
import { execFileSync } from "node:child_process";

const REPO = "ttaiyosuzuki/neurafusion-desktop";
const APPLY = process.argv.includes("--apply");

/** 残す workflow。ここに無いものは全部止めます。 */
const KEEP = new Set(["nf-build-mac"]);

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1 << 24 });
}

let permissions;
try {
  permissions = JSON.parse(gh(["api", `repos/${REPO}/actions/permissions`]));
} catch (e) {
  console.error(`Actions の設定を読めません: ${e.message}`);
  process.exit(2);
}

if (!permissions.enabled) {
  console.log("Actions はいま**無効**です。");
  console.log("この状態では workflow の一覧も取れません（止める対象も動きません）。");
  console.log("");
  console.log("順番:");
  console.log("  1. リポジトリ設定で Actions を有効にする");
  console.log("  2. すぐに `node scripts/nf-disable-upstream-workflows.mjs --apply` を走らせる");
  console.log("");
  console.log("⚠️ 有効にした瞬間、上流の 105 本が動き出します。1 と 2 の間を空けないこと。");
  process.exit(0);
}

let workflows;
try {
  /* ★--paginate は複数ページの JSON オブジェクトを**連結**して返すので、素の JSON.parse は
     2ページ目の頭で落ちる（2026-09-18 実測: 106本 > 1ページ100件で発生）。
     --jq で1本ずつ NDJSON にしてから読む。 */
  workflows = gh(["api", `repos/${REPO}/actions/workflows`, "--paginate", "--jq", ".workflows[]"])
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
} catch (e) {
  console.error(`workflow の一覧を取れません: ${e.message}`);
  process.exit(2);
}

const toDisable = workflows.filter((w) => {
  const name = w.path.replace(/^\.github\/workflows\//, "").replace(/\.ya?ml$/, "");
  return !KEEP.has(name) && w.state === "active";
});
const kept = workflows.filter((w) => {
  const name = w.path.replace(/^\.github\/workflows\//, "").replace(/\.ya?ml$/, "");
  return KEEP.has(name);
});

console.log(`workflow 総数: ${workflows.length}`);
console.log(`残す:   ${kept.map((w) => w.path).join(", ") || "（まだ無い）"}`);
console.log(`止める: ${toDisable.length} 本`);

if (!APPLY) {
  for (const w of toDisable.slice(0, 10)) console.log(`  - ${w.path}`);
  if (toDisable.length > 10) console.log(`  …ほか ${toDisable.length - 10} 本`);
  console.log("\n--apply を付けると実際に止めます。");
  process.exit(0);
}

let done = 0;
const failed = [];
for (const w of toDisable) {
  try {
    gh(["api", "--method", "PUT", `repos/${REPO}/actions/workflows/${w.id}/disable`]);
    done += 1;
  } catch (e) {
    failed.push(`${w.path}: ${e.message.split("\n")[0]}`);
  }
}

console.log(`\n止めた: ${done} 本`);
if (failed.length > 0) {
  console.error(`止められなかった: ${failed.length} 本`);
  for (const f of failed) console.error(`  ${f}`);
  process.exit(1);
}
console.log("残っているのは、残す一覧に書いたものだけです。");
