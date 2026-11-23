// ワークツリーを作る（置き場所・使い回し・node_modules の複製）。作る道（API・新しいチャット・PR・ゴミ箱から戻す）はどれも WorktreeService.create を通る
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { GitWorktree } from "@shared/git/types";
import { runCommand } from "@/foundation/core/system/exec";
import { Conflict, Invalid } from "@/foundation/core/errors";
import { git } from "@/foundation/core/workplace/git";
import { assertBranchName, gitPrefix, hasRef, headSha, isIgnored } from "@/foundation/core/workplace/reads";
import { forgetWorktrees, listWorktrees, repoTop, worktreeRootFor } from "@/foundation/core/workplace/worktrees";

/** 新しいワークツリーへ、本体から写すフォルダ（Git で無視していて、作り直すのに時間がかかるもの） */
const CARRY_DIRS = ["node_modules"];

/**
 * 作ったばかりのワークツリーを、すぐ作業できるようにする: 本体の node_modules などを APFS の複製（cp -c。中身を共有するので容量はほぼ増えない）で写す。
 * 本物のフォルダとして写すので、ワークツリーで npm install しても本体は変わらず、リンク先をたどらない道具（Vite の配信の制限など）でも困らない。
 * Git で無視していないもの・ワークツリーにすでにあるもの・本体にないものは写さない。写せなくても（APFS でないなど）ワークツリーの作成は失敗させない
 */
export async function prepareWorktree(repo: string, target: string): Promise<string[]> {
  const carried: string[] = [];
  for (const dir of CARRY_DIRS) {
    const from = path.join(repo, dir);
    const to = path.join(target, dir);
    if (!(await fs.stat(from).catch(() => null))?.isDirectory()) continue;
    if (await fs.stat(to).catch(() => null)) continue;
    if (!(await isIgnored(repo, dir))) continue;
    try {
      await runCommand("cp", ["-c", "-R", from, to], { timeout: 120_000 });
      carried.push(dir);
    } catch (e) {
      console.warn(`[worktree] ${dir} を写せませんでした`, e);
      await fs.rm(to, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  return carried;
}

/**
 * ワークツリーを作る。ブランチがなければいまのコミットから作り、あればそのブランチを取り出す。
 * 置き場所は worktreePathFor で決める。同じリポジトリのほかのプロジェクト（リポジトリの中の別のフォルダ）が、同じブランチでもう作っていれば、それを使う。
 * プロジェクトのフォルダがリポジトリの中のフォルダで、取り出すコミットにそのフォルダがなければ（まだコミットしていない）、ワークツリーの中に出てこないので断る（400）。
 * 作ったら、本体の node_modules などを写してすぐ作業できるようにし（prepareWorktree。リポジトリの一番上の分も）、onCreated に作ったワークツリーを渡す
 * （ワークツリーの実行環境。もうあるワークツリーを使い回したときは呼ばない）。
 * base は新しいブランチの元のコミット（省けば本体の HEAD。AI の create_chat は作る側のチャットの作業場所のいまのコミットを渡す。ブランチがもうあれば使わない）
 */
export async function addWorktree(repo: string, branch: string, onCreated?: (worktree: GitWorktree) => Promise<void>, base?: string): Promise<GitWorktree[]> {
  await assertBranchName(branch);
  const [target, prefix] = await Promise.all([worktreeRootFor(repo, branch), gitPrefix(repo)]);
  const existing = (await listWorktrees(repo, { fresh: true })).find((w) => w.root === target);
  if (existing && existing.branch === branch && !existing.prunable) return listWorktrees(repo);
  if (await fs.stat(target).catch(() => null)) throw new Conflict(`フォルダがすでにあります: ${target}`);
  const exists = await hasRef(repo, `refs/heads/${branch}`);
  if (prefix) {
    const from = exists ? `refs/heads/${branch}` : (base ?? "HEAD");
    const present = await git(repo).ok(["cat-file", "-e", `${from}:${prefix}`]);
    if (!present) {
      throw new Invalid(`プロジェクトフォルダ（${prefix}）が ${exists ? `ブランチ ${branch}` : "いまのコミット"} にまだないため、ワークツリーに出てきません。先にフォルダをコミットしてください`);
    }
  }
  await git(repo).run(exists ? ["worktree", "add", target, branch] : ["worktree", "add", "-b", branch, target, ...(base ? [base] : [])]);
  forgetWorktrees(repo);
  const top = await repoTop(repo);
  if (prefix) await prepareWorktree(path.join(top, prefix), path.join(target, prefix));
  await prepareWorktree(top, target);
  const list = await listWorktrees(repo);
  const made = list.find((w) => w.root === target);
  if (made && onCreated) await onCreated(made);
  return list;
}

/** 新しいブランチの元にするコミット（fromDir = 作業するフォルダのいまのコミット。fromDir がない・コミットがまだなければ undefined = 本体の HEAD） */
export async function baseOf(fromDir: string): Promise<string | undefined> {
  return existsSync(fromDir) ? ((await headSha(fromDir)) ?? undefined) : undefined;
}
