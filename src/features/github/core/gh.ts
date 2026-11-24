// gh（GitHub CLI）を動かす唯一の口。認証などを聞かれても待たず、プロジェクトで選んだアカウントのトークンを渡し（account.ts）、
// 失敗はよくある理由（gh がない・GitHub でない・ログインしていない・見えない・使用量の上限・つながらない）を分かる文にする
import { GITHUB_DEFAULT_HOST, isDefaultGitHubHost, normalizeGitHubHost } from "@shared/foundation/codeHost";
import type { GitHubStatus } from "@shared/foundation/server";
import type { GitHubAccount } from "@shared/git/types";
import { Invalid } from "@/foundation/core/errors";
import { CommandError, nonInteractiveEnv, runCommand } from "@/foundation/core/system/exec";
import { ttlCache } from "@/foundation/core/system/ttlCache";
import { currentGitHubAccount, githubHostEnv, parseGhAccounts } from "./account";

export const GH_MISSING = "gh が見つかりません。`brew install gh` でインストールしてください";
export const GH_LOGGED_OUT = "GitHub にログインしていません。ターミナルで `gh auth login` を実行してください";

interface GhOptions {
  cwd?: string;
  /** 連携先のホスト（アカウントのトークンを選ぶ。省けば github.com） */
  host?: string;
  timeout: number;
  /** この終了コードも成功として出力を返す */
  okCodes?: number[];
  maxBuffer?: number;
  /** false ならアカウントのトークンを足さない（認証そのものを聞くとき） */
  asAccount?: boolean;
}

/** gh を実行する（失敗は CommandError。アカウントのトークンが取れなければ 400） */
export async function runGh(args: string[], { asAccount = true, host, ...opts }: GhOptions): Promise<string> {
  return runCommand("gh", args, { ...opts, env: { ...nonInteractiveEnv(), ...(asAccount ? await githubEnv(host) : {}) } });
}

/** gh の失敗のうち、よくある理由を分かる文にする（知らない失敗は null。純粋な関数。repo は連携先） */
export function knownGhFailure(e: unknown, repo: string | null): string | null {
  const stderr = e instanceof CommandError ? e.stderr : e instanceof Error ? e.message : String(e);
  if (e instanceof CommandError && e.code === "ENOENT") return GH_MISSING;
  if (/known GitHub host/i.test(stderr)) return "プッシュ先が GitHub ではないので、PR は作れません";
  if (/gh auth login|Bad credentials|HTTP 401|authentication required|not logged/i.test(stderr)) return GH_LOGGED_OUT;
  if (/Could not resolve to a Repository|HTTP 404/i.test(stderr))
    return repo ? `連携先のリポジトリ「${repo}」が見つからないか、このアカウントでは見られません` : "GitHub で見つかりませんでした";
  if (/rate limit|HTTP 403|secondary rate/i.test(stderr)) return "GitHub の使用量の上限に達したか、権限がありません。しばらくしてから取り直してください";
  if (/timed out|ETIMEDOUT|ENOTFOUND|ECONNRESET|network/i.test(stderr)) return "GitHub につながりませんでした。ネットワークを確かめてください";
  return null;
}

/** gh の失敗を、分かる文にする（知らない失敗は gh の最初の行を添える。純粋な関数。repo は連携先） */
export function ghFailureMessage(e: unknown, repo: string | null): string {
  const known = knownGhFailure(e, repo);
  if (known) return known;
  const stderr = e instanceof CommandError ? e.stderr : e instanceof Error ? e.message : String(e);
  const line = stderr.split("\n").find((l) => l.trim()) ?? "";
  return `GitHub に聞けませんでした: ${line.replace(/^gh: /, "").slice(0, 300)}`;
}

/** トークンを覚える間（gh に毎回聞かない。ログインし直しても 5 分で新しいものになる。キーは「ホスト 改行 アカウント」） */
const tokens = ttlCache<string, string>({ ms: 5 * 60_000 });

/** アカウントのトークン（gh auth token --hostname --user。gh にそのアカウントがなければ 400） */
async function tokenOf(account: string, host: string): Promise<string> {
  const key = `${host}\n${account}`;
  const cached = tokens.get(key);
  if (cached) return cached;
  try {
    const token = (await runGh(["auth", "token", "--hostname", host, "--user", account], { timeout: 10_000, asAccount: false })).trim();
    if (!token) throw new Error("empty");
    tokens.set(key, token);
    return token;
  } catch {
    const where = isDefaultGitHubHost(host) ? "GitHub" : host;
    throw new Invalid(`gh に ${where} のアカウント「${account}」でログインしていません。ターミナルで \`gh auth login\` を実行するか、プロジェクトの設定の「GitHub」でアカウントを選び直してください`);
  }
}

/** いまの操作の gh に足す環境変数（host = 連携先のホスト。アカウントを選んでいなければトークンは足さない。gh にそのアカウントがなければ 400） */
export async function githubEnv(host: string = GITHUB_DEFAULT_HOST): Promise<Record<string, string>> {
  const account = currentGitHubAccount();
  return githubHostEnv(host, account ? await tokenOf(account, normalizeGitHubHost(host)) : null);
}

/**
 * いまの操作の git に足す環境変数（gh を認証の補助にしていれば、プッシュ・プルが選んだアカウントになる）。
 * アカウントが使えなくても手元の操作（状態・差分など）は止めず、gh で有効なアカウントのままにする。
 * git の操作はホストを知らないので github.com の分（Enterprise を足すときは、連携先のホストを渡す）
 */
export const githubEnvForGit = (host: string = GITHUB_DEFAULT_HOST): Promise<Record<string, string>> => githubEnv(host).catch(() => ({}));

/** gh に入っている、そのホスト（既定は github.com）のアカウント（gh がない・古い・ログインしていなければ空） */
export async function listGitHubAccounts(host: string = GITHUB_DEFAULT_HOST): Promise<GitHubAccount[]> {
  try {
    return parseGhAccounts(await runGh(["auth", "status", "--json", "hosts"], { timeout: 10_000, okCodes: [1], asAccount: false }), host);
  } catch {
    return [];
  }
}

/** gh CLI のインストール・ログイン状態（push と PR 作成に使う） */
export async function githubStatus(): Promise<GitHubStatus> {
  try {
    await runGh(["--version"], { timeout: 10_000 });
  } catch {
    return { installed: false, logged_in: false, detail: GH_MISSING };
  }
  try {
    const account = (await runGh(["api", "user", "--jq", ".login"], { timeout: 20_000 })).trim();
    return { installed: true, logged_in: true, account, detail: `${account} でログイン済み` };
  } catch {
    return { installed: true, logged_in: false, detail: "未ログインです。ターミナルで `gh auth login` を実行してください" };
  }
}
