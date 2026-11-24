// ワークツリーを消す前の確かめ: 画面の確認の材料（removalInfo）と、後始末の確かめ（inspectWorktree = コミットしていない変更・取り込み済みか・取り込んでいないコミット）
import path from "node:path";
import type { WorktreeRemovalInfo } from "@shared/git/types";
import type { GitWorktree } from "@shared/foundation/workplace";
import type { Project } from "@shared/projects/types";
import { NotFound } from "@/foundation/core/errors";
import { git } from "@/foundation/core/workplace/git";
import { changedCount, isAncestor, listRemotes } from "@/foundation/core/workplace/reads";
import { listWorktrees } from "@/foundation/core/workplace/worktrees";
import type { FinishFacts } from "./report";

/** 取り込み済みかの、Git の外の見分け（github が登録する: ブランチのマージ済みの PR。fork からの同じ名前の PR は除く） */
export interface MergeCheck {
  mergedPull(project: Project, branch: string): Promise<{ number: number; head_sha: string } | null>;
}

/** 消す前の確かめ（finishedText などの元と、控えに使うブランチの先） */
export interface WorktreeFacts extends FinishFacts {
  tip: string | null;
}

/**
 * 消す前の確かめ（コミットしていない変更・取り込み済みか・取り込んでいないコミット）。断るためでなく、何を控えに入れたか・取り込み済みかを伝えるため。
 * 取り込み済み = ブランチの先が本体のブランチに含まれている、または mergeChecks の PR がマージ済みで、PR の最後のコミットが手元の先と同じか祖先（squash・rebase でマージしても見分けられる）
 */
export async function inspectWorktree(project: Project, worktree: GitWorktree, list: GitWorktree[], mergeChecks: readonly MergeCheck[]): Promise<WorktreeFacts> {
  const repo = project.repo_path;
  const changes = worktree.prunable ? 0 : await changedCount(worktree.root).catch(() => 0);
  const branch = worktree.branch;
  const tip = (branch ? (await git(repo).maybe(["rev-parse", `refs/heads/${branch}`])).trim() : worktree.head) || null;
  const main = list.find((w) => w.main);
  const into = main?.branch ?? null;
  const mainRef = into ? `refs/heads/${into}` : (main?.head ?? null);
  if (!tip || !mainRef) return { branch, changes, merged: null, unmerged: 0, tip };
  const unmerged = Number((await git(repo).maybe(["rev-list", "--count", tip, "--not", mainRef])).trim()) || 0;
  // ローカルで取り込んだ: ブランチの先が本体のブランチに含まれている
  if (await isAncestor(repo, tip, mainRef)) return { branch, changes, merged: { via: "local", into: into ?? "本体" }, unmerged: 0, tip };
  // GitHub などで取り込んだ: PR がマージ済みで、PR に入った最後のコミットのあとに手元で足したコミットがない
  for (const check of branch ? mergeChecks : []) {
    const pr = await check.mergedPull(project, branch!).catch(() => null);
    if (pr && (pr.head_sha === tip || (await isAncestor(repo, tip, pr.head_sha)))) return { branch, changes, merged: { via: "github", pr: pr.number }, unmerged, tip };
  }
  return { branch, changes, merged: null, unmerged, tip };
}

/** AI が指したワークツリー（フォルダ・一番上・ブランチの名前・フォルダの名前のどれか。空なら undefined） */
export function findNamedWorktree(list: GitWorktree[], name: string | undefined): GitWorktree | undefined {
  const key = name?.trim();
  return key ? list.find((w) => [w.path, w.root, w.branch, path.basename(w.root)].includes(key)) : undefined;
}

/** ワークツリーの一覧の文（AI に選んでもらうため。本体は除く） */
export function worktreeNames(list: GitWorktree[]): string {
  const names = list.filter((w) => !w.main).map((w) => w.branch ?? w.path);
  return names.length > 0 ? names.join("、") : "（なし）";
}

/** ワークツリーを消す前の確かめ（コミットしていない変更の数・どのリモートにもないコミットの数・プッシュしたことがあるか） */
export async function removalInfo(repo: string, target: string): Promise<Omit<WorktreeRemovalInfo, "db_connections">> {
  const worktree = (await listWorktrees(repo, { fresh: true })).find((w) => w.path === target);
  if (!worktree) throw new NotFound("ワークツリーが見つかりません");
  // ワークツリーは一番上ごと消えるので、変更も一番上から数える
  const changes = worktree.prunable ? 0 : await changedCount(worktree.root).catch(() => 0);
  const hasRemote = (await listRemotes(repo).catch(() => [])).length > 0;
  const branch = worktree.branch;
  const ref = `refs/heads/${branch}`;
  const unpushed = branch && hasRemote ? await git(repo).maybe(["rev-list", "--count", ref, "--not", "--remotes"]) : "0";
  // --branches と組む --exclude は refs/heads/ を付けない名前で書く
  const onlyHere = branch ? await git(repo).maybe(["rev-list", "--count", ref, "--not", `--exclude=${branch}`, "--branches", "--remotes"]) : "0";
  const upstream = branch ? await git(repo).maybe(["rev-parse", "--abbrev-ref", `${branch}@{upstream}`]) : "";
  return {
    branch,
    changes,
    unpushed: Number(unpushed.trim()) || 0,
    only_here: Number(onlyHere.trim()) || 0,
    pushed: Boolean(upstream.trim()),
    has_remote: hasRemote,
  };
}
