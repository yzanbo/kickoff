// プロジェクトごとの GitHub のアカウント（gh に入っているアカウントのどれを使うか）。
// gh の有効なアカウントは切り替えず、そのプロジェクトの操作の間だけ、選んだアカウントのトークンを GH_TOKEN で gh と git に渡す
// （git は gh を認証の補助（credential helper）にしていれば、プッシュ・プルもそのアカウントになる）
import { AsyncLocalStorage } from "node:async_hooks";
import { GITHUB_DEFAULT_HOST, isDefaultGitHubHost, normalizeGitHubHost } from "@shared/foundation/codeHost";
import type { GitHubAccount } from "@shared/git/types";

/** いまの操作で使うアカウント（null なら gh で有効なもの） */
const current = new AsyncLocalStorage<{ account: string | null }>();

/** fn の中の gh・git を、そのアカウントで動かす（null なら gh で有効なもの） */
export function runAsGitHubAccount<T>(account: string | null, fn: () => T): T {
  return current.run({ account }, fn);
}

/** いまの操作で選んでいるアカウント（選んでいなければ null。トークンは gh.ts の githubEnv が引く） */
export const currentGitHubAccount = (): string | null => current.getStore()?.account ?? null;

/**
 * ホストとトークンを gh・git に渡す環境変数（純粋な関数）。gh はトークンを github.com（と *.ghe.com）なら GH_TOKEN、
 * GitHub Enterprise Server なら GH_ENTERPRISE_TOKEN から読む。github.com でなければ GH_HOST も渡す（ホストを決められない gh のコマンドのため）
 */
export function githubHostEnv(host: string, token: string | null): Record<string, string> {
  const h = normalizeGitHubHost(host);
  if (isDefaultGitHubHost(h)) return token ? { GH_TOKEN: token } : {};
  return { GH_HOST: h, ...(token ? { [h.endsWith(".ghe.com") ? "GH_TOKEN" : "GH_ENTERPRISE_TOKEN"]: token } : {}) };
}

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
