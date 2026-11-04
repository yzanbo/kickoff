// ワークツリー（同じリポジトリの別のブランチを、隣のフォルダに取り出す）
import fs from "node:fs/promises";
import path from "node:path";
import type { GitWorktree, WorktreeRemovalInfo } from "@shared/types";
import { prepareWorktree } from "./worktreeSetup.js";
import { gitOutput } from "./exec.js";
import { hasRef, listRemotes } from "./status.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";

/** `git worktree list --porcelain` を読む（空行で区切られた塊ごとに 1 つ。最初が本体） */
export function parseWorktrees(out: string): GitWorktree[] {
  return out
    .split("\n\n")
    .map((block) => block.split("\n").filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines, i) => {
      const field = (name: string) => lines.find((l) => l === name || l.startsWith(`${name} `));
      const branch = field("branch")?.slice(7) ?? null;
      return {
        path: field("worktree")?.slice(9) ?? "",
        branch: branch?.startsWith("refs/heads/") ? branch.slice(11) : branch,
        head: field("HEAD")?.slice(5) ?? "",
        main: i === 0,
        locked: Boolean(field("locked")),
        prunable: Boolean(field("prunable")),
      };
    });
}

export async function listWorktrees(repo: string): Promise<GitWorktree[]> {
  return parseWorktrees(await gitOutput(repo, ["worktree", "list", "--porcelain"]));
}

/** フォルダのパスで、このリポジトリのワークツリーを探す（本体も含む。なければ undefined） */
export async function findWorktree(repo: string, folder: string): Promise<GitWorktree | undefined> {
  return (await listWorktrees(repo)).find((w) => w.path === folder);
}

/** 新しいワークツリーを置くフォルダ（リポジトリの隣の <名前>-worktrees/<ブランチ名>。/ は - にする） */
export async function worktreePathFor(repo: string, branch: string): Promise<string> {
  const root = await fs.realpath(repo);
  return path.join(path.dirname(root), `${path.basename(root)}-worktrees`, branch.replace(/[\\/]+/g, "-"));
}

/**
 * ワークツリーを作る。ブランチがなければいまのコミットから作り、あればそのブランチを取り出す。
 * 置き場所は worktreePathFor で決める（すでにあれば失敗する）。作ったら、本体の node_modules などを写してすぐ作業できるようにする（prepareWorktree）
 */
export async function addWorktree(repo: string, branch: string): Promise<GitWorktree[]> {
  await gitOutput(repo, ["check-ref-format", "--branch", branch]).catch(() => {
    throw new Invalid("ブランチの名前に使えない文字があります");
  });
  const target = await worktreePathFor(repo, branch);
  if (await fs.stat(target).catch(() => null)) throw new Conflict(`フォルダがすでにあります: ${target}`);
  const exists = await hasRef(repo, `refs/heads/${branch}`);
  await gitOutput(repo, exists ? ["worktree", "add", target, branch] : ["worktree", "add", "-b", branch, target]);
  await prepareWorktree(await fs.realpath(repo), target);
  return listWorktrees(repo);
}

/** ワークツリーを消す前の確かめ（コミットしていない変更の数・どのリモートにもないコミットの数・プッシュしたことがあるか） */
export async function worktreeRemovalInfo(repo: string, target: string): Promise<WorktreeRemovalInfo> {
  const worktree = await findWorktree(repo, target);
  if (!worktree) throw new NotFound("ワークツリーが見つかりません");
  const ok = (p: Promise<string>) => p.then((out) => out, () => "");
  const changes = worktree.prunable ? "" : await ok(gitOutput(target, ["status", "--porcelain"]));
  const hasRemote = (await listRemotes(repo).catch(() => [])).length > 0;
  const branch = worktree.branch;
  const ref = `refs/heads/${branch}`;
  const unpushed = branch && hasRemote ? await ok(gitOutput(repo, ["rev-list", "--count", ref, "--not", "--remotes"])) : "0";
  // --branches と組む --exclude は refs/heads/ を付けない名前で書く
  const onlyHere = branch ? await ok(gitOutput(repo, ["rev-list", "--count", ref, "--not", `--exclude=${branch}`, "--branches", "--remotes"])) : "0";
  const upstream = branch ? await ok(gitOutput(repo, ["rev-parse", "--abbrev-ref", `${branch}@{upstream}`])) : "";
  return {
    branch,
    changes: changes.split("\n").filter(Boolean).length,
    unpushed: Number(unpushed.trim()) || 0,
    only_here: Number(onlyHere.trim()) || 0,
    pushed: Boolean(upstream.trim()),
    has_remote: hasRemote,
  };
}

/**
 * ワークツリーを消す（本体は消せない。force: コミットしていない変更があっても消す）。フォルダがアプリの外で消されていれば、Git の記録だけを消す。
 * deleteBranch なら、取り出していたブランチも -D で消す（プッシュしていないコミットがあっても消すので、画面で確かめてから呼ぶ。
 * PR がマージされたあとの片付けもこれ: GitHub で squash などでマージすると、手元では「マージ済み」にならないため）
 */
export async function removeWorktree(repo: string, target: string, { force = false, deleteBranch = false } = {}): Promise<GitWorktree[]> {
  const worktree = await findWorktree(repo, target);
  if (!worktree) throw new NotFound("ワークツリーが見つかりません");
  if (worktree.main) throw new Invalid("本体のフォルダは消せません");
  if (worktree.prunable) await gitOutput(repo, ["worktree", "prune"]);
  else await gitOutput(repo, ["worktree", "remove", ...(force ? ["--force"] : []), target]);
  if (deleteBranch && worktree.branch) await gitOutput(repo, ["branch", "-D", worktree.branch]);
  return listWorktrees(repo);
}
