import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitHubStatus, PullRequestInfo } from "./types.js";

const execFileAsync = promisify(execFile);

/** gh CLI のインストール・ログイン状態（push と PR 作成に使う） */
export async function githubStatus(): Promise<GitHubStatus> {
  try {
    await execFileAsync("gh", ["--version"], { timeout: 10_000 });
  } catch {
    return { installed: false, loggedIn: false, detail: "gh が見つかりません。`brew install gh` でインストールしてください" };
  }
  try {
    const { stdout } = await execFileAsync("gh", ["api", "user", "--jq", ".login"], { timeout: 20_000 });
    const account = stdout.trim();
    return { installed: true, loggedIn: true, account, detail: `${account} でログイン済み` };
  } catch {
    return { installed: true, loggedIn: false, detail: "未ログインです。ターミナルで `gh auth login` を実行してください" };
  }
}

/** gh を実行する（失敗したら gh の説明を文にする。認証などを聞かれても待たない） */
async function gh(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args, { cwd, timeout: 60_000, env: { ...process.env, GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" } });
    return stdout;
  } catch (e) {
    const err = e as { code?: unknown; stderr?: unknown };
    if (err.code === "ENOENT") throw new Error("gh が見つかりません。`brew install gh` でインストールしてください");
    const detail = typeof err.stderr === "string" ? err.stderr.trim() : "";
    if (/known GitHub host/i.test(detail)) throw new Error("プッシュ先が GitHub ではないので、PR は作れません");
    if (/gh auth login/i.test(detail)) throw new Error("GitHub にログインしていません。ターミナルで `gh auth login` を実行してください");
    throw detail ? new Error(detail) : e;
  }
}

const PR_FIELDS = "number,url,title,state,isDraft";

/** ブランチの PR（なければ null） */
export async function pullRequestFor(cwd: string, branch: string): Promise<PullRequestInfo | null> {
  try {
    return JSON.parse(await gh(cwd, ["pr", "view", branch, "--json", PR_FIELDS])) as PullRequestInfo;
  } catch (e) {
    // PR がまだない
    if (/no pull requests found/i.test(String((e as Error).message))) return null;
    throw e;
  }
}

/** いまのブランチの PR を作る（タイトルと本文はコミットから。プッシュは先に済ませておく） */
export async function createPullRequest(cwd: string, branch: string): Promise<PullRequestInfo> {
  await gh(cwd, ["pr", "create", "--fill", "--head", branch]);
  const pr = await pullRequestFor(cwd, branch);
  if (!pr) throw new Error("PR を作れませんでした");
  return pr;
}
