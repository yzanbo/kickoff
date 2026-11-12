// プロジェクトごとの GitHub のアカウント（gh に入っているアカウントのどれを使うか）。
// gh の有効なアカウントは切り替えず、そのプロジェクトの操作の間だけ、選んだアカウントのトークンを GH_TOKEN で gh と git に渡す
// （git は gh を認証の補助（credential helper）にしていれば、プッシュ・プルもそのアカウントになる）
import { AsyncLocalStorage } from "node:async_hooks";
import { GITHUB_DEFAULT_HOST, isDefaultGitHubHost, normalizeGitHubHost } from "@shared/github/host";
import type { GitHubAccount } from "@shared/types";
import { Invalid } from "../http/errors.js";
import { nonInteractiveEnv, runCommand } from "../system/exec.js";
import { ttlCache } from "../system/ttlCache.js";

/** いまの操作で使うアカウント（null なら gh で有効なもの） */
const current = new AsyncLocalStorage<{ account: string | null }>();

/** fn の中の gh・git を、そのアカウントで動かす（null なら gh で有効なもの） */
export function runAsGitHubAccount<T>(account: string | null, fn: () => T): T {
  return current.run({ account }, fn);
}

/** トークンを覚える間（gh に毎回聞かない。ログインし直しても 5 分で新しいものになる。キーは「ホスト 改行 アカウント」） */
const tokens = ttlCache<string, string>(5 * 60_000);

/** アカウントのトークン（gh auth token --hostname --user。gh にそのアカウントがなければ 400） */
async function tokenOf(account: string, host: string): Promise<string> {
  const key = `${host}\n${account}`;
  const cached = tokens.get(key);
  if (cached) return cached;
  try {
    const token = (await runCommand("gh", ["auth", "token", "--hostname", host, "--user", account], { timeout: 10_000, env: nonInteractiveEnv() })).trim();
    if (!token) throw new Error("empty");
    tokens.set(key, token);
    return token;
  } catch {
    const where = isDefaultGitHubHost(host) ? "GitHub" : host;
    throw new Invalid(`gh に ${where} のアカウント「${account}」でログインしていません。ターミナルで \`gh auth login\` を実行するか、プロジェクトの設定の「GitHub」でアカウントを選び直してください`);
  }
}

/**
 * ホストとトークンを gh・git に渡す環境変数（純粋な関数）。gh はトークンを github.com（と *.ghe.com）なら GH_TOKEN、
 * GitHub Enterprise Server なら GH_ENTERPRISE_TOKEN から読む。github.com でなければ GH_HOST も渡す（ホストを決められない gh のコマンドのため）
 */
export function githubHostEnv(host: string, token: string | null): Record<string, string> {
  const h = normalizeGitHubHost(host);
  if (isDefaultGitHubHost(h)) return token ? { GH_TOKEN: token } : {};
  return { GH_HOST: h, ...(token ? { [h.endsWith(".ghe.com") ? "GH_TOKEN" : "GH_ENTERPRISE_TOKEN"]: token } : {}) };
}

/** いまの操作の gh に足す環境変数（host = 連携先のホスト。アカウントを選んでいなければトークンは足さない。gh にそのアカウントがなければ 400） */
export async function githubEnv(host: string = GITHUB_DEFAULT_HOST): Promise<Record<string, string>> {
  const account = current.getStore()?.account;
  return githubHostEnv(host, account ? await tokenOf(account, normalizeGitHubHost(host)) : null);
}

/**
 * いまの操作の git に足す環境変数（gh を認証の補助にしていれば、プッシュ・プルが選んだアカウントになる）。
 * アカウントが使えなくても手元の操作（状態・差分など）は止めず、gh で有効なアカウントのままにする。
 * git の操作はホストを知らないので github.com の分（Enterprise を足すときは、連携先のホストを渡す）
 */
export const githubEnvForGit = (host: string = GITHUB_DEFAULT_HOST): Promise<Record<string, string>> => githubEnv(host).catch(() => ({}));

/** gh auth status --json hosts のそのホストの分を、アカウントの一覧にする（既定は github.com。純粋な関数） */
export function parseGhAccounts(json: string, host: string = GITHUB_DEFAULT_HOST): GitHubAccount[] {
  try {
    const hosts = (JSON.parse(json) as { hosts?: Record<string, { login?: string; active?: boolean; state?: string }[]> }).hosts ?? {};
    const key = Object.keys(hosts).find((h) => normalizeGitHubHost(h) === normalizeGitHubHost(host));
    return (key ? hosts[key] : [])
      .filter((a): a is { login: string; active?: boolean; state?: string } => typeof a.login === "string" && a.login !== "")
      .map((a) => ({ login: a.login, active: a.active === true, ok: a.state === undefined || a.state === "success" }));
  } catch {
    return [];
  }
}

/** gh に入っている、そのホスト（既定は github.com）のアカウント（gh がない・古い・ログインしていなければ空） */
export async function listGitHubAccounts(host: string = GITHUB_DEFAULT_HOST): Promise<GitHubAccount[]> {
  try {
    return parseGhAccounts(await runCommand("gh", ["auth", "status", "--json", "hosts"], { timeout: 10_000, env: nonInteractiveEnv(), okCodes: [1] }), host);
  } catch {
    return [];
  }
}
