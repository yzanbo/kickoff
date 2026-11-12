// GitHub タブが GitHub に聞く口（gh api。プロジェクトで選んだアカウントのトークンは githubAccount の runAsGitHubAccount の中で渡る）。
// 失敗は、よくある理由（gh がない・ログインしていない・リポジトリが見えない・使用量の上限）を分かる文にする。
// 書き込み（段階 3）は JSON の本文を一時ファイルから --input で渡し、GitHub が断った理由（保護ルールなど）をそのまま文にする
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommandError, nonInteractiveEnv, runCommand } from "../system/exec.js";
import { Invalid } from "../http/errors.js";
import { GITHUB_DEFAULT_HOST, isDefaultGitHubHost } from "@shared/github/host";
import { githubEnv } from "../git/githubAccount.js";

/** GraphQL の変数（文字は -f でそのまま渡し、@ で始まってもファイルとして読ませない） */
export type GraphqlVars = Record<string, string | number | boolean | null>;

/** REST の応答（status は 304 = 前と変わっていない） */
export interface RestResponse {
  status: number;
  etag: string | null;
  body: unknown;
}

/** GitHub に聞く口（テストでは差し替える） */
export interface GitHubApi {
  graphql<T>(query: string, vars: GraphqlVars): Promise<T>;
  /** etag を渡すと、変わっていなければ 304（使用量に数えられない） */
  rest(path: string, opts?: { etag?: string | null }): Promise<RestResponse>;
  /** 続きのページもすべて（配列の応答。maxPages まで） */
  restPages(path: string, maxPages: number): Promise<{ items: unknown[]; truncated: boolean }>;
  /** 書き込み（POST・PATCH・PUT・DELETE と JSON の本文）。GitHub が断ったら、その理由の文で Invalid */
  send(method: WriteMethod, path: string, body?: unknown): Promise<unknown>;
}

/** プロジェクトの連携先とアカウントで GitHub に聞くための組（GitHubService.within が作る） */
export interface GitHubContext {
  /** GitHub のホスト（github.com など） */
  host: string;
  /** 「持ち主/名前」 */
  repo: string;
  owner: string;
  name: string;
  api: GitHubApi;
  /** 覚えるときのキーの頭（プロジェクト・リポジトリ・アカウント） */
  key: string;
}

export type WriteMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export const GH_MISSING = "gh が見つかりません。`brew install gh` でインストールしてください";
export const GH_LOGGED_OUT = "GitHub にログインしていません。ターミナルで `gh auth login` を実行してください";

/** gh の失敗を、分かる文にする（純粋な関数。repo は連携先） */
export function ghFailureMessage(e: unknown, repo: string | null): string {
  const stderr = e instanceof CommandError ? e.stderr : e instanceof Error ? e.message : String(e);
  if (e instanceof CommandError && e.code === "ENOENT") return GH_MISSING;
  if (/gh auth login|Bad credentials|HTTP 401|authentication required|not logged/i.test(stderr)) return GH_LOGGED_OUT;
  if (/Could not resolve to a Repository|HTTP 404/i.test(stderr))
    return repo ? `連携先のリポジトリ「${repo}」が見つからないか、このアカウントでは見られません` : "GitHub で見つかりませんでした";
  if (/rate limit|HTTP 403|secondary rate/i.test(stderr)) return "GitHub の使用量の上限に達したか、権限がありません。しばらくしてから取り直してください";
  if (/timed out|ETIMEDOUT|ENOTFOUND|ECONNRESET|network/i.test(stderr)) return "GitHub につながりませんでした。ネットワークを確かめてください";
  const line = stderr.split("\n").find((l) => l.trim()) ?? "";
  return `GitHub に聞けませんでした: ${line.replace(/^gh: /, "").slice(0, 300)}`;
}

/**
 * 書き込みを GitHub が断ったときの文（純粋な関数）。GitHub の答えの message と errors（保護ルール・入力の誤りの説明）を添える。
 * 401 はログインの案内、404 は見えない・書き込めない
 */
export function githubWriteError(status: number, body: unknown, repo: string | null): string {
  if (status === 401) return GH_LOGGED_OUT;
  const b = (body && typeof body === "object" ? body : {}) as { message?: unknown; errors?: unknown };
  const details = (Array.isArray(b.errors) ? b.errors : [])
    .map((e) => (typeof e === "string" ? e : e && typeof e === "object" ? String((e as { message?: unknown }).message ?? (e as { code?: unknown }).code ?? "") : ""))
    .filter(Boolean);
  const message = typeof b.message === "string" ? b.message : "";
  if (status === 404) return `${repo ? `「${repo}」` : ""}で見つからないか、このアカウントには書き込む権限がありません${message && message !== "Not Found" ? `（${message}）` : ""}`;
  const text = [message, ...details].filter((t, i, all) => t && all.indexOf(t) === i).join(" / ");
  return `GitHub に断られました（HTTP ${status}）${text ? `: ${text.slice(0, 500)}` : ""}`;
}

/** gh api に渡すホストの引数（github.com なら何も足さない。純粋な関数） */
export const ghApiHostArgs = (host: string): string[] => (isDefaultGitHubHost(host) ? [] : ["--hostname", host]);

/** gh api を動かす（host = 聞く先のホスト。okCodes の終了コードも成功として出力を返す） */
async function runGhApi(args: string[], repo: string | null, host: string, okCodes: number[] = []): Promise<string> {
  try {
    return await runCommand("gh", ["api", ...ghApiHostArgs(host), ...args], {
      timeout: 60_000,
      env: { ...nonInteractiveEnv(), ...(await githubEnv(host)) },
      okCodes,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if (e instanceof Invalid) throw e;
    throw new Invalid(ghFailureMessage(e, repo));
  }
}

/** gh api -i の出力を、状態・ETag・本文に分ける（純粋な関数） */
export function parseIncludeOutput(out: string): RestResponse {
  const sep = out.search(/\r?\n\r?\n/);
  const head = sep < 0 ? out : out.slice(0, sep);
  const rest = sep < 0 ? "" : out.slice(sep).replace(/^\r?\n\r?\n/, "");
  const status = Number(/^HTTP\/[\d.]+ (\d{3})/.exec(head)?.[1] ?? 0);
  const etag = /^etag:\s*(.+)$/im.exec(head)?.[1]?.trim() ?? null;
  let body: unknown = null;
  if (rest.trim()) {
    try {
      body = JSON.parse(rest);
    } catch {
      body = null;
    }
  }
  return { status, etag, body };
}

/** gh で GitHub に聞く口（repo は失敗の文に使う連携先。host は聞く先のホスト） */
export function ghApi(repo: string | null, host: string = GITHUB_DEFAULT_HOST): GitHubApi {
  return {
    async graphql<T>(query: string, vars: GraphqlVars): Promise<T> {
      const args = ["graphql", "-f", `query=${query}`];
      for (const [k, v] of Object.entries(vars)) {
        if (v === null) continue;
        args.push(typeof v === "string" ? "-f" : "-F", `${k}=${v}`);
      }
      const out = JSON.parse(await runGhApi(args, repo, host)) as { data?: T; errors?: { message: string }[] };
      if (!out.data) throw new Invalid(ghFailureMessage(new Error(out.errors?.map((e) => e.message).join("\n") ?? "no data"), repo));
      return out.data;
    },
    async rest(path, opts = {}) {
      const args = ["-i", ...(opts.etag ? ["-H", `If-None-Match: ${opts.etag}`] : []), path];
      // 304 は gh が失敗（終了コード 1）にするので、出力から状態を読む
      const res = parseIncludeOutput(await runGhApi(args, repo, host, [1]));
      if (res.status >= 400 || res.status === 0) throw new Invalid(ghFailureMessage(new Error(`HTTP ${res.status}`), repo));
      return res;
    },
    async restPages(path, maxPages) {
      const items: unknown[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const sep = path.includes("?") ? "&" : "?";
        const out = JSON.parse(await runGhApi([`${path}${sep}per_page=100&page=${page}`], repo, host)) as unknown[];
        items.push(...out);
        if (out.length < 100) return { items, truncated: false };
      }
      return { items, truncated: true };
    },
    async send(method, apiPath, body) {
      // 本文は一時ファイルから渡す（-f / -F では空の配列・入れ子を送れず、-F は @ で始まる値をファイルとして読むため）
      const file = body === undefined ? null : path.join(os.tmpdir(), `kickoff-gh-${crypto.randomUUID()}.json`);
      if (file) await fs.writeFile(file, JSON.stringify(body), { mode: 0o600 });
      try {
        // 断られたときも gh は応答を出して終わり値 1 を返すので、状態の行と本文から理由を読む
        const res = parseIncludeOutput(await runGhApi(["-i", "-X", method, ...(file ? ["--input", file] : []), apiPath], repo, host, [1]));
        if (res.status === 0) throw new Invalid(ghFailureMessage(new Error("no response"), repo));
        if (res.status >= 400) throw new Invalid(githubWriteError(res.status, res.body, repo));
        return res.body;
      } finally {
        if (file) await fs.rm(file, { force: true });
      }
    },
  };
}
