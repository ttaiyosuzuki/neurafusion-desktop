// NF 右下の丸 — 自動更新（DK-07）。起動時に新しい版を確かめ、**本人の了承を得てから**入れ替える。
// 了承が無ければ何もしない（知らせるだけ）。配布は GitHub のリリースの tarball（README「入れかた」と同じ）。

import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const RELEASES_LATEST_API = "https://api.github.com/repos/ttaiyosuzuki/neurafusion-desktop/releases/latest";

export type ReleaseInfo = { tag: string; version: string; tarballUrl: string | null; htmlUrl?: string };

export type UpdateCheck =
  | { status: "up-to-date"; current: string; latest: string }
  | { status: "available"; current: string; latest: string; tarballUrl: string; htmlUrl?: string }
  | { status: "unknown"; current: string; why: string };

export type UpdateOutcome =
  | { status: "up-to-date" | "unknown"; check: UpdateCheck }
  | { status: "declined"; check: UpdateCheck }
  | { status: "installed"; check: UpdateCheck }
  | { status: "install-failed"; check: UpdateCheck; why: string };

export type UpdateDeps = {
  fetchJson: (url: string) => Promise<unknown>;
  /** 本人に聞く。true のときだけ入れ替える */
  confirm: (message: string) => Promise<boolean>;
  install: (tarballUrl: string) => Promise<void>;
};

/** "v2026.9.10" / "2026.9.10-beta.1" → 数の並び（先頭の v と - 以降は比べない）。読めなければ null */
export function parseVersion(v: string): number[] | null {
  const core = v.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "";
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split(".").map((n) => Number(n));
}

/** a < b なら負、同じなら 0、a > b なら正。読めなければ null */
export function compareVersions(a: string, b: string): number | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** GitHub のリリース API の返り値から、版と tarball（neurafusion-desktop-*.tgz か neurafusion-*.tgz）を取る */
export function parseRelease(raw: unknown): ReleaseInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { tag_name?: unknown; html_url?: unknown; assets?: unknown; draft?: unknown; prerelease?: unknown };
  if (typeof r.tag_name !== "string" || r.draft === true || r.prerelease === true) return null;
  const version = r.tag_name.replace(/^v/i, "");
  let tarballUrl: string | null = null;
  if (Array.isArray(r.assets)) {
    for (const a of r.assets as { name?: unknown; browser_download_url?: unknown }[]) {
      if (
        typeof a.name === "string" &&
        typeof a.browser_download_url === "string" &&
        /^neurafusion(-desktop)?-[\d.]+.*\.tgz$/.test(a.name) &&
        a.browser_download_url.startsWith("https://github.com/ttaiyosuzuki/neurafusion-desktop/releases/download/")
      ) {
        tarballUrl = a.browser_download_url;
        break;
      }
    }
  }
  return { tag: r.tag_name, version, tarballUrl, ...(typeof r.html_url === "string" ? { htmlUrl: r.html_url } : {}) };
}

export async function checkForUpdate(current: string, deps: Pick<UpdateDeps, "fetchJson">): Promise<UpdateCheck> {
  let rel: ReleaseInfo | null;
  try {
    rel = parseRelease(await deps.fetchJson(RELEASES_LATEST_API));
  } catch (err) {
    return { status: "unknown", current, why: `取得できませんでした: ${String((err as Error)?.message ?? err)}` };
  }
  if (!rel) return { status: "unknown", current, why: "リリースの形が読めませんでした" };
  const cmp = compareVersions(current, rel.version);
  if (cmp === null) return { status: "unknown", current, why: "版を比べられませんでした" };
  if (cmp >= 0) return { status: "up-to-date", current, latest: rel.version };
  if (!rel.tarballUrl) return { status: "unknown", current, why: `新しい版 ${rel.version} に tarball がありません` };
  return { status: "available", current, latest: rel.version, tarballUrl: rel.tarballUrl, ...(rel.htmlUrl ? { htmlUrl: rel.htmlUrl } : {}) };
}

/** 確かめて、新しい版があれば本人に聞き、了承されたときだけ入れ替える。 */
export async function checkAndMaybeUpdate(current: string, deps: UpdateDeps): Promise<UpdateOutcome> {
  const check = await checkForUpdate(current, deps);
  if (check.status !== "available") return { status: check.status, check };
  const ok = await deps.confirm(
    `NeuraFusion の新しい版 ${check.latest} があります（今は ${check.current}）。今すぐ更新しますか？`,
  );
  if (!ok) return { status: "declined", check };
  try {
    await deps.install(check.tarballUrl);
    return { status: "installed", check };
  } catch (err) {
    return { status: "install-failed", check, why: String((err as Error)?.message ?? err) };
  }
}

const execFileAsync = promisify(execFile);

export function realUpdateDeps(confirm: UpdateDeps["confirm"]): UpdateDeps {
  return {
    fetchJson: async (url) => {
      const res = await fetch(url, {
        headers: { accept: "application/vnd.github+json", "user-agent": "neurafusion-desktop-update-check" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    confirm,
    install: async (tarballUrl) => {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      await execFileAsync(npm, ["install", "-g", tarballUrl], { maxBuffer: 16 * 1024 * 1024 });
    },
  };
}
