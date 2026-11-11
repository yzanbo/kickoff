// プロジェクトごとの GitHub のアカウント（gh に入っているアカウントのどれを使うか）。
// gh の有効なアカウントは切り替えず、そのプロジェクトの操作の間だけ、選んだアカウントのトークンを GH_TOKEN で gh と git に渡す
// （git は gh を認証の補助（credential helper）にしていれば、プッシュ・プルもそのアカウントになる）
import { AsyncLocalStorage } from "node:async_hooks";
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

/** トークンを覚える間（gh に毎回聞かない。ログインし直しても 5 分で新しいものになる） */
const tokens = ttlCache<string, string>(5 * 60_000);

/** アカウントのトークン（gh auth token --user。gh にそのアカウントがなければ 400） */
async function tokenOf(account: string): Promise<string> {
  const cached = tokens.get(account);
  if (cached) return cached;
  try {
    const token = (await runCommand("gh", ["auth", "token", "--hostname", "github.com", "--user", account], { timeout: 10_000, env: nonInteractiveEnv() })).trim();
    if (!token) throw new Error("empty");
    tokens.set(account, token);
    return token;
  } catch {
    throw new Invalid(`gh に GitHub のアカウント「${account}」でログインしていません。ターミナルで \`gh auth login\` を実行するか、プロジェクトの設定の「GitHub」でアカウントを選び直してください`);
  }
}

/** いまの操作の gh に足す環境変数（アカウントを選んでいなければ何も足さない。gh にそのアカウントがなければ 400） */
export async function githubEnv(): Promise<Record<string, string>> {
  const account = current.getStore()?.account;
  return account ? { GH_TOKEN: await tokenOf(account) } : {};
}

/**
 * いまの操作の git に足す環境変数（gh を認証の補助にしていれば、プッシュ・プルが選んだアカウントになる）。
 * アカウントが使えなくても手元の操作（状態・差分など）は止めず、gh で有効なアカウントのままにする
 */
export const githubEnvForGit = (): Promise<Record<string, string>> => githubEnv().catch(() => ({}));

/** gh auth status --json hosts の github.com の分を、アカウントの一覧にする（純粋な関数） */
export function parseGhAccounts(json: string): GitHubAccount[] {
  try {
    const hosts = (JSON.parse(json) as { hosts?: Record<string, { login?: string; active?: boolean; state?: string }[]> }).hosts ?? {};
    return (hosts["github.com"] ?? [])
      .filter((a): a is { login: string; active?: boolean; state?: string } => typeof a.login === "string" && a.login !== "")
      .map((a) => ({ login: a.login, active: a.active === true, ok: a.state === undefined || a.state === "success" }));
  } catch {
    return [];
  }
}

/** gh に入っている GitHub のアカウント（gh がない・古い・ログインしていなければ空） */
export async function listGitHubAccounts(): Promise<GitHubAccount[]> {
  try {
    return parseGhAccounts(await runCommand("gh", ["auth", "status", "--json", "hosts"], { timeout: 10_000, env: nonInteractiveEnv(), okCodes: [1] }));
  } catch {
    return [];
  }
}
