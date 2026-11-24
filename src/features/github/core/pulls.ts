// ブランチの PR（gh pr view・list・create。gh を動かすのは gh.ts）
import { errorMessage } from "@shared/foundation/errors";
import { CommandError } from "@/foundation/core/system/exec";
import type { PullRequestInfo } from "@shared/git/types";
import { isDefaultGitHubHost } from "@shared/foundation/codeHost";
import { Invalid } from "@/foundation/core/errors";
import { knownGhFailure, runGh } from "./gh";
import { ownerOf, type GitHubTarget } from "./target";

/** 連携先を gh に渡す引数（github.com でなければ「ホスト/持ち主/名前」。決まっていなければ、gh がフォルダの remote から決める。純粋な関数） */
export const repoArgs = (target: GitHubTarget | null) => (target ? ["--repo", isDefaultGitHubHost(target.host) ? target.repo : `${target.host}/${target.repo}`] : []);

/** ブランチを gh に渡す形（連携先が fork の元なら「持ち主:ブランチ」。手元のブランチは origin にあるため） */
const headRef = (branch: string, target: GitHubTarget | null) => (target && ownerOf(target.repo).toLowerCase() !== target.headOwner.toLowerCase() ? `${target.headOwner}:${branch}` : branch);

/** 作業場所で gh を実行する（host = 連携先のホスト。失敗は、よくある理由なら分かる文の Invalid。ほかは gh の説明のまま） */
async function gh(cwd: string, args: string[], host?: string): Promise<string> {
  try {
    return await runGh(args, { cwd, timeout: 60_000, host });
  } catch (e) {
    const known = e instanceof CommandError ? knownGhFailure(e, null) : null;
    if (known) throw new Invalid(known);
    throw e;
  }
}

const PR_FIELDS = "number,url,title,state,isDraft";

/** gh の PR の JSON（camelCase）を、API の形（snake_case）にする */
export function toPullRequestInfo(raw: { number: number; url: string; title: string; state: PullRequestInfo["state"]; isDraft?: boolean }): PullRequestInfo {
  return { number: raw.number, url: raw.url, title: raw.title, state: raw.state, is_draft: raw.isDraft === true };
}

/** ブランチの PR（なければ null） */
export async function pullRequestFor(cwd: string, branch: string, target: GitHubTarget | null = null): Promise<PullRequestInfo | null> {
  try {
    return toPullRequestInfo(JSON.parse(await gh(cwd, ["pr", "view", headRef(branch, target), ...repoArgs(target), "--json", PR_FIELDS], target?.host)));
  } catch (e) {
    // PR がまだない
    if (/no pull requests found/i.test(errorMessage(e))) return null;
    throw e;
  }
}

/** ブランチと PR の組（ワークツリーの PR の見張りが、プロジェクトごとに 1 回まとめて取る） */
export interface BranchPullRequest {
  number: number;
  title: string;
  url: string;
  state: PullRequestInfo["state"];
  /** PR の元のブランチ（head） */
  branch: string;
  /** PR の元のブランチがあるリポジトリの持ち主（手元のブランチのプッシュ先の持ち主と同じものだけが、手元のブランチの PR） */
  head_owner: string;
}

/** 見張りで見る PR の数（新しい順。手元のワークツリーのブランチの PR は、ふつうこの中に入る） */
const PR_LIST_LIMIT = 100;

/** リポジトリの PR を、状態によらず新しい順に取る（gh pr list を 1 回。失敗は gh の説明で投げる） */
export async function listPullRequests(cwd: string, target: GitHubTarget): Promise<BranchPullRequest[]> {
  const out = await gh(cwd, ["pr", "list", ...repoArgs(target), "--state", "all", "--limit", String(PR_LIST_LIMIT), "--json", "number,title,url,state,headRefName,headRepositoryOwner"], target?.host);
  const rows = JSON.parse(out) as { number: number; title: string; url: string; state: PullRequestInfo["state"]; headRefName: string; headRepositoryOwner?: { login?: string } | null }[];
  return rows.map((r) => ({ number: r.number, title: r.title, url: r.url, state: r.state, branch: r.headRefName, head_owner: r.headRepositoryOwner?.login ?? "" }));
}

/** マージ済みの PR（番号・URL・PR に入った最後のコミット） */
export interface MergedPullRequest {
  number: number;
  url: string;
  head_sha: string;
}

/**
 * ブランチのマージ済みの PR（いちばん新しいもの。手元のブランチのプッシュ先の持ち主のものだけ = ほかの fork からの同じ名前は除く。PR の見張りと同じ見方）。
 * なければ null（ワークツリーの後始末が、GitHub で取り込んだかを見分ける）
 */
export async function mergedPullRequestOf(cwd: string, target: GitHubTarget, branch: string): Promise<MergedPullRequest | null> {
  const out = await gh(cwd, ["pr", "list", ...repoArgs(target), "--state", "merged", "--head", branch, "--limit", "20", "--json", "number,url,headRefOid,headRefName,headRepositoryOwner"], target.host);
  const rows = JSON.parse(out) as { number: number; url: string; headRefOid: string; headRefName: string; headRepositoryOwner?: { login?: string } | null }[];
  const own = rows.filter((r) => r.headRefName === branch && (r.headRepositoryOwner?.login ?? "").toLowerCase() === target.headOwner.toLowerCase()).sort((a, b) => b.number - a.number)[0];
  return own ? { number: own.number, url: own.url, head_sha: own.headRefOid } : null;
}

/**
 * PR の本文の終わりに「Closes #n」を足す（マージしたら issue が閉じる。もう書いてある番号は足さない。純粋な関数）。
 * 足すものがなければ null
 */
export function withClosingRefs(body: string, issues: number[]): string | null {
  const written = new Set([...body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)\b/gi)].map((m) => Number(m[1])));
  const add = [...new Set(issues)].filter((n) => !written.has(n)).sort((a, b) => a - b);
  if (add.length === 0) return null;
  const lines = add.map((n) => `Closes #${n}`).join("\n");
  return body.trim() ? `${body.trimEnd()}\n\n${lines}` : lines;
}

/**
 * いまのブランチの PR を作る（タイトルと本文はコミットから。プッシュは先に済ませておく）。
 * closes は閉じる issue（この作業場所の issue に結び付いたチャットのもの）で、作ったあと本文の終わりに「Closes #n」を足す
 */
export async function createPullRequest(cwd: string, branch: string, target: GitHubTarget | null = null, closes: number[] = []): Promise<PullRequestInfo> {
  await gh(cwd, ["pr", "create", ...repoArgs(target), "--fill", "--head", headRef(branch, target)], target?.host);
  const pr = await pullRequestFor(cwd, branch, target);
  if (!pr) throw new Invalid("PR を作れませんでした");
  if (closes.length > 0) {
    const { body } = JSON.parse(await gh(cwd, ["pr", "view", String(pr.number), ...repoArgs(target), "--json", "body"], target?.host)) as { body?: string };
    const next = withClosingRefs(body ?? "", closes);
    if (next !== null) await gh(cwd, ["pr", "edit", String(pr.number), ...repoArgs(target), "--body", next], target?.host);
  }
  return pr;
}
