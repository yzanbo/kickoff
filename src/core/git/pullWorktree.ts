// PR のブランチを手元のワークツリーに取り出す（GitHub タブの「レビューコメントで直す」。要件 5.11 の段階 2）
import type { GitHubRemote, GitWorktree } from "@shared/types";
import { Invalid } from "../http/errors.js";
import { gitOutput } from "./exec.js";
import { hasRef } from "./status.js";
import { addWorktree, listWorktrees } from "./worktrees.js";

/** 取り出す PR（head_repo は元のブランチのあるリポジトリの「持ち主/名前」。消された fork なら null） */
export interface PullHead {
  number: number;
  head_ref: string;
  head_repo: string | null;
}

/** 取り出し方（純粋な関数で決める） */
export interface PullCheckout {
  /** 手元のブランチの名前 */
  branch: string;
  /**
   * 元のブランチがある remote（同じリポジトリ・自分の fork など、手元に remote があるもの）。
   * あれば同じ名前のブランチにして追いかけ（プッシュすれば PR に載る）、なければ連携先の refs/pull/N/head を pr-N に取ってくる（ほかの人の fork）
   */
  remote: string | null;
}

const sameRepo = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** PR の取り出し方を決める（元のブランチのリポジトリを remote に持っていればそのブランチ名、なければ pr-N。純粋な関数） */
export function pullCheckoutOf(pr: PullHead, remotes: GitHubRemote[]): PullCheckout {
  const remote = pr.head_repo ? remotes.find((r) => sameRepo(r.repo, pr.head_repo!)) : undefined;
  return remote ? { branch: pr.head_ref, remote: remote.name } : { branch: `pr-${pr.number}`, remote: null };
}

/**
 * PR のブランチのワークツリー（本体も含む）を返す。そのブランチを取り出している作業場所があればそれを、
 * なければブランチを用意して（手元になければ取ってくる。あれば手元のものをそのまま使い、書き換えない）ワークツリーを作る。
 * targetRemote は連携先の remote の名前（refs/pull/N/head を取ってくる先）
 */
export async function checkoutPullWorktree(repo: string, pr: PullHead, remotes: GitHubRemote[], targetRemote: string): Promise<GitWorktree> {
  const { branch } = pullCheckoutOf(pr, remotes);
  const found = (await listWorktrees(repo)).find((w) => w.branch === branch && !w.prunable);
  if (found) return found;
  await ensurePullBranch(repo, pr, remotes, targetRemote);
  const list = await addWorktree(repo, branch);
  const made = list.find((w) => w.branch === branch);
  if (!made) throw new Error(`ワークツリーを作れませんでした: ${branch}`);
  return made;
}

/** PR の手元のブランチを用意する（手元になければ取ってくる。あれば手元のものをそのまま使い、書き換えない）。ブランチの名前を返す */
async function ensurePullBranch(repo: string, pr: PullHead, remotes: GitHubRemote[], targetRemote: string): Promise<string> {
  const { branch, remote } = pullCheckoutOf(pr, remotes);
  if (await hasRef(repo, `refs/heads/${branch}`)) return branch;
  if (remote) {
    await gitOutput(repo, ["fetch", remote, `+refs/heads/${pr.head_ref}:refs/remotes/${remote}/${pr.head_ref}`]);
    await gitOutput(repo, ["branch", "--track", branch, `${remote}/${pr.head_ref}`]);
  } else {
    await gitOutput(repo, ["fetch", targetRemote, `refs/pull/${pr.number}/head:refs/heads/${branch}`]);
  }
  return branch;
}

/**
 * PR のブランチを本体に取り出す（GitHub タブの「チェックアウト」で本体を選んだとき。要件 5.11 の段階 3）。
 * ほかのワークツリーで取り出しているブランチは本体に取り出せないので 400。まだコミットしていない変更は git switch がそのまま持っていく
 * （ぶつかるなら git が断る。画面が前に確かめる）。取り出したブランチの名前を返す
 */
export async function checkoutPullMain(repo: string, pr: PullHead, remotes: GitHubRemote[], targetRemote: string): Promise<string> {
  const { branch } = pullCheckoutOf(pr, remotes);
  const holder = (await listWorktrees(repo)).find((w) => w.branch === branch && !w.prunable);
  if (holder?.main) return branch;
  if (holder) throw new Invalid(`ブランチ ${branch} はワークツリー（${holder.path}）で取り出しているので、本体には取り出せません。そのワークツリーで作業してください`);
  await ensurePullBranch(repo, pr, remotes, targetRemote);
  await gitOutput(repo, ["switch", "-q", branch]);
  return branch;
}
