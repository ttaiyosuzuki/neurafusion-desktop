// v7 OP-09c 利用者の鍵を OS のキーチェーンに置く（指示書 §2 #9）。ファイル・ログ・画面には出さない。
//   macOS: /usr/bin/security（Keychain）。書く時は `security -i` に標準入力で命令を渡す＝鍵がコマンドの引数（ps で見える）に乗らない
//   Linux: secret-tool（Secret Service・libsecret）。store は標準入力で鍵を受ける
//   Windows: 資格情報マネージャー（advapi32 の CredWrite／CredRead）。PowerShell に標準入力で手順を渡す（鍵は base64 で手順の中）
// openclaw 側の既存の仕組みは「ほかの CLI の鍵を読む」だけ（src/plugin-sdk/provider-auth-claude-compat.ts の find-generic-password）
// で、書く口が無い。macOS の security の置き場は同じ /usr/bin/security を使う。
// エラーの文に相手の stderr を混ぜない（鍵の手がかりを出さない）。
import { spawn } from "node:child_process";

export const KEYCHAIN_SERVICE = "jp.neurafusion.trace";
const MACOS_SECURITY_PATH = "/usr/bin/security";

export interface RunResult {
  code: number;
  stdout: string;
}
/** コマンドを動かす口（テストは偽物）。secret は input にだけ入れ、args には入れない */
export type Runner = (cmd: string, args: string[], input?: string) => Promise<RunResult>;

export const spawnRunner: Runner = (cmd, args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d: string) => (stdout += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout }));
    child.stdin.end(input ?? "");
  });

export interface SecretStore {
  readonly kind: "macos-keychain" | "secret-service" | "windows-credential-manager";
  get(account: string): Promise<string | null>;
  set(account: string, secret: string): Promise<void>;
  delete(account: string): Promise<void>;
}

const ACCOUNT_RE = /^[a-z][a-z0-9_-]{0,40}$/;
/** 鍵に使える文字（API の鍵は印字できる ASCII。引用符・逆斜線・空白は命令の文を壊すので受けない） */
const SECRET_RE = /^[\x21\x23-\x5b\x5d-\x7e]{8,512}$/;

function checkAccount(account: string): void {
  if (!ACCOUNT_RE.test(account)) throw new Error("鍵の名前（会社の名前）が決まりに合いません");
}
function checkSecret(secret: string): void {
  if (!SECRET_RE.test(secret)) throw new Error("鍵の形が決まりに合いません（8〜512 字・印字できる英数記号・引用符と空白なし）");
}

function macos(run: Runner): SecretStore {
  return {
    kind: "macos-keychain",
    async get(account) {
      checkAccount(account);
      const r = await run(MACOS_SECURITY_PATH, ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"]);
      if (r.code !== 0) return null;
      const v = r.stdout.replace(/\r?\n$/, "");
      return v || null;
    },
    async set(account, secret) {
      checkAccount(account);
      checkSecret(secret);
      const r = await run(MACOS_SECURITY_PATH, ["-i"], `add-generic-password -U -s "${KEYCHAIN_SERVICE}" -a "${account}" -l "NeuraFusion 道筋" -w "${secret}"\n`);
      if (r.code !== 0) throw new Error(`キーチェーンに保存できませんでした（security ${r.code}）`);
    },
    async delete(account) {
      checkAccount(account);
      await run(MACOS_SECURITY_PATH, ["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account]);
    },
  };
}

function secretService(run: Runner): SecretStore {
  return {
    kind: "secret-service",
    async get(account) {
      checkAccount(account);
      const r = await run("secret-tool", ["lookup", "service", KEYCHAIN_SERVICE, "account", account]);
      if (r.code !== 0) return null;
      const v = r.stdout.replace(/\r?\n$/, "");
      return v || null;
    },
    async set(account, secret) {
      checkAccount(account);
      checkSecret(secret);
      const r = await run("secret-tool", ["store", "--label=NeuraFusion 道筋", "service", KEYCHAIN_SERVICE, "account", account], secret);
      if (r.code !== 0) throw new Error(`Secret Service に保存できませんでした（secret-tool ${r.code}）`);
    },
    async delete(account) {
      checkAccount(account);
      await run("secret-tool", ["clear", "service", KEYCHAIN_SERVICE, "account", account]);
    },
  };
}

/** PowerShell の手順（標準入力で渡す）。鍵は base64 で手順の中にだけ入る */
export function windowsScript(op: "get" | "set" | "delete", target: string, secret?: string): string {
  const b64 = secret ? Buffer.from(secret, "utf8").toString("base64") : "";
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -TypeDefinition @'",
    "using System; using System.Runtime.InteropServices; using System.Text;",
    "public static class NfCred {",
    "  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct C { public int Flags; public int Type; public string TargetName; public string Comment; public long LastWritten; public int BlobSize; public IntPtr Blob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }",
    '  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredWrite(ref C c, int flags);',
    '  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredRead(string t, int type, int flags, out IntPtr c);',
    '  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool CredDelete(string t, int type, int flags);',
    '  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr p);',
    "  public static void Set(string t, string b64) { byte[] b = Convert.FromBase64String(b64); IntPtr p = Marshal.AllocHGlobal(b.Length); Marshal.Copy(b, 0, p, b.Length); C c = new C(); c.Type = 1; c.TargetName = t; c.BlobSize = b.Length; c.Blob = p; c.Persist = 2; c.UserName = \"neurafusion\"; bool ok = CredWrite(ref c, 0); Marshal.FreeHGlobal(p); if (!ok) throw new Exception(\"CredWrite\"); }",
    "  public static string Get(string t) { IntPtr p; if (!CredRead(t, 1, 0, out p)) return null; C c = (C)Marshal.PtrToStructure(p, typeof(C)); byte[] b = new byte[c.BlobSize]; Marshal.Copy(c.Blob, b, 0, c.BlobSize); CredFree(p); return Encoding.UTF8.GetString(b); }",
    "  public static void Del(string t) { CredDelete(t, 1, 0); }",
    "}",
    "'@",
    op === "set"
      ? `[NfCred]::Set('${target}', '${b64}')`
      : op === "get"
        ? `$v = [NfCred]::Get('${target}'); if ($v -eq $null) { exit 3 } else { [Console]::Out.Write($v) }`
        : `[NfCred]::Del('${target}')`,
    "",
  ].join("\n");
}

function windows(run: Runner): SecretStore {
  const ps = (script: string) => run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "-"], script);
  const target = (account: string) => `${KEYCHAIN_SERVICE}/${account}`;
  return {
    kind: "windows-credential-manager",
    async get(account) {
      checkAccount(account);
      const r = await ps(windowsScript("get", target(account)));
      return r.code === 0 && r.stdout ? r.stdout : null;
    },
    async set(account, secret) {
      checkAccount(account);
      checkSecret(secret);
      const r = await ps(windowsScript("set", target(account), secret));
      if (r.code !== 0) throw new Error(`資格情報マネージャーに保存できませんでした（${r.code}）`);
    },
    async delete(account) {
      checkAccount(account);
      await ps(windowsScript("delete", target(account)));
    },
  };
}

/** その OS のキーチェーン（無い OS は null＝鍵を持たず、台帳だけで出す） */
export function keychainFor(platform: NodeJS.Platform = process.platform, run: Runner = spawnRunner): SecretStore | null {
  if (platform === "darwin") return macos(run);
  if (platform === "linux") return secretService(run);
  if (platform === "win32") return windows(run);
  return null;
}
