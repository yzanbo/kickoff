import { errorMessage } from "@shared/errors";
import { CommandError, nonInteractiveEnv, runCommand } from "../system/exec.js";
import type { GitHubStatus, PullRequestInfo } from "@shared/types";
import { Invalid } from "../http/errors.js";

const GH_MISSING = "gh が見つかりません。`brew install gh` でインストールしてください";

/** gh を実行する（認証などを聞かれても待たない。失敗は CommandError） */
const runGh = (args: string[], opts: { cwd?: string; timeout: number }) => runCommand("gh", args, { ...opts, env: nonInteractiveEnv() });

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

/** 作業場所で gh を実行する（失敗したら、よくある理由は分かる文にする。ほかは gh の説明のまま） */
async function gh(cwd: string, args: string[]): Promise<string> {
  try {
    return await runGh(args, { cwd, timeout: 60_000 });
  } catch (e) {
    if (e instanceof CommandError) {
      if (e.code === "ENOENT") throw new Invalid(GH_MISSING);
      if (/known GitHub host/i.test(e.stderr)) throw new Invalid("プッシュ先が GitHub ではないので、PR は作れません");
      if (/gh auth login/i.test(e.stderr)) throw new Invalid("GitHub にログインしていません。ターミナルで `gh auth login` を実行してください");
    }
    throw e;
  }
}

const PR_FIELDS = "number,url,title,state,isDraft";

/** ブランチの PR（なければ null） */
export async function pullRequestFor(cwd: string, branch: string): Promise<PullRequestInfo | null> {
  try {
    return JSON.parse(await gh(cwd, ["pr", "view", branch, "--json", PR_FIELDS])) as PullRequestInfo;
  } catch (e) {
    // PR がまだない
    if (/no pull requests found/i.test(errorMessage(e))) return null;
    throw e;
  }
}

/** いまのブランチの PR を作る（タイトルと本文はコミットから。プッシュは先に済ませておく） */
export async function createPullRequest(cwd: string, branch: string): Promise<PullRequestInfo> {
  await gh(cwd, ["pr", "create", "--fill", "--head", branch]);
  const pr = await pullRequestFor(cwd, branch);
  if (!pr) throw new Invalid("PR を作れませんでした");
  return pr;
}
