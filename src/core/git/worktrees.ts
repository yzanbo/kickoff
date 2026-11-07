// ワークツリー（同じリポジトリの別のブランチを、隣のフォルダに取り出す）
import fs from "node:fs/promises";
import path from "node:path";
import type { GitWorktree, WorktreeRemovalInfo } from "@shared/types";
import { prepareWorktree } from "./worktreeSetup.js";
import { gitOutput } from "./exec.js";
import { gitPrefix, hasRef, listRemotes } from "./status.js";
import { Conflict, Invalid, NotFound } from "../http/errors.js";

/**
 * `git worktree list --porcelain` を読む（空行で区切られた塊ごとに 1 つ。最初が本体）。
 * prefix はプロジェクトのフォルダのリポジトリの中での位置（gitPrefix）で、path はワークツリーの中の同じ位置のフォルダにする（root は一番上のまま）
 */
export function parseWorktrees(out: string, prefix = ""): GitWorktree[] {
  return out
    .split("\n\n")
    .map((block) => block.split("\n").filter(Boolean))
    .filter((lines) => lines.length > 0)
    .map((lines, i) => {
      const field = (name: string) => lines.find((l) => l === name || l.startsWith(`${name} `));
      const branch = field("branch")?.slice(7) ?? null;
      const root = field("worktree")?.slice(9) ?? "";
      return {
        path: prefix ? path.join(root, prefix) : root,
        root,
        branch: branch?.startsWith("refs/heads/") ? branch.slice(11) : branch,
        head: field("HEAD")?.slice(5) ?? "",
        main: i === 0,
        locked: Boolean(field("locked")),
        prunable: Boolean(field("prunable")),
      };
    });
}

/** ワークツリーの一覧（repo はプロジェクトのフォルダ。リポジトリの中のフォルダなら、各ワークツリーの中の同じ位置を path にする） */
export async function listWorktrees(repo: string): Promise<GitWorktree[]> {
  const [out, prefix] = await Promise.all([gitOutput(repo, ["worktree", "list", "--porcelain"]), gitPrefix(repo)]);
  return parseWorktrees(out, prefix ?? "");
}

/** フォルダのパス（作業するフォルダ = path）で、このリポジトリのワークツリーを探す（本体も含む。なければ undefined） */
export async function findWorktree(repo: string, folder: string): Promise<GitWorktree | undefined> {
  return (await listWorktrees(repo)).find((w) => w.path === folder);
}

/** リポジトリの一番上のフォルダ（実体のパス） */
const repoTop = async (repo: string) => fs.realpath((await gitOutput(repo, ["rev-parse", "--show-toplevel"])).trim());

/** 新しいワークツリーを置く一番上のフォルダ（リポジトリの一番上の隣の <名前>-worktrees/<ブランチ名>。/ は - にする） */
async function worktreeRootFor(repo: string, branch: string): Promise<string> {
  const root = await repoTop(repo);
  return path.join(path.dirname(root), `${path.basename(root)}-worktrees`, branch.replace(/[\\/]+/g, "-"));
}

/** 新しいワークツリーで作業するフォルダ（一番上は worktreeRootFor。プロジェクトのフォルダがリポジトリの中のフォルダなら、その中の同じ位置） */
export async function worktreePathFor(repo: string, branch: string): Promise<string> {
  const [root, prefix] = await Promise.all([worktreeRootFor(repo, branch), gitPrefix(repo)]);
  return prefix ? path.join(root, prefix) : root;
}

/**
 * ワークツリーを作る。ブランチがなければいまのコミットから作り、あればそのブランチを取り出す。
 * 置き場所は worktreePathFor で決める。同じリポジトリのほかのプロジェクト（リポジトリの中の別のフォルダ）が、同じブランチでもう作っていれば、それを使う。
 * プロジェクトのフォルダがリポジトリの中のフォルダで、取り出すコミットにそのフォルダがなければ（まだコミットしていない）、ワークツリーの中に出てこないので断る（400）。
 * 作ったら、本体の node_modules などを写してすぐ作業できるようにする（prepareWorktree。リポジトリの一番上の分も）
 */
export async function addWorktree(repo: string, branch: string): Promise<GitWorktree[]> {
  await gitOutput(repo, ["check-ref-format", "--branch", branch]).catch(() => {
    throw new Invalid("ブランチの名前に使えない文字があります");
  });
  const [target, prefix] = await Promise.all([worktreeRootFor(repo, branch), gitPrefix(repo)]);
  const existing = (await listWorktrees(repo)).find((w) => w.root === target);
  if (existing && existing.branch === branch && !existing.prunable) return listWorktrees(repo);
  if (await fs.stat(target).catch(() => null)) throw new Conflict(`フォルダがすでにあります: ${target}`);
  const exists = await hasRef(repo, `refs/heads/${branch}`);
  if (prefix) {
    const base = exists ? `refs/heads/${branch}` : "HEAD";
    const present = await gitOutput(repo, ["cat-file", "-e", `${base}:${prefix}`]).then(
      () => true,
      () => false,
    );
    if (!present) {
      throw new Invalid(`プロジェクトのフォルダ（${prefix}）が ${exists ? `ブランチ ${branch}` : "いまのコミット"} にまだないため、ワークツリーに出てきません。先にフォルダをコミットしてください`);
    }
  }
  await gitOutput(repo, exists ? ["worktree", "add", target, branch] : ["worktree", "add", "-b", branch, target]);
  const top = await repoTop(repo);
  if (prefix) await prepareWorktree(path.join(top, prefix), path.join(target, prefix));
  await prepareWorktree(top, target);
  return listWorktrees(repo);
}

/**
 * プロジェクトのフォルダを oldRepo から newRepo に変えるときの、ワークツリーの作業場所の付け替え先（古い path → 新しい path）。
 * 同じリポジトリの中で変えたなら、同じワークツリーの中の新しいフォルダ（そのブランチになければ null）。別のリポジトリ・Git でないフォルダなら null（本体で続ける）。
 * ここにない作業場所（古いフォルダが見つからない・もう消えたワークツリー）も null にする
 */
export async function worktreeMoves(oldRepo: string, newRepo: string): Promise<Map<string, string | null>> {
  const read = (repo: string) => listWorktrees(repo).catch((): GitWorktree[] => []);
  const [before, after] = await Promise.all([read(oldRepo), read(newRepo)]);
  const sameRepo = before.length > 0 && after.length > 0 && before[0].root === after[0].root;
  const moves = new Map<string, string | null>();
  for (const w of before) {
    if (w.main) continue;
    const next = sameRepo ? after.find((n) => n.root === w.root) : undefined;
    moves.set(w.path, next && !next.prunable && (await fs.stat(next.path).catch(() => null))?.isDirectory() ? next.path : null);
  }
  return moves;
}

/** ワークツリーを消す前の確かめ（コミットしていない変更の数・どのリモートにもないコミットの数・プッシュしたことがあるか） */
export async function worktreeRemovalInfo(repo: string, target: string): Promise<WorktreeRemovalInfo> {
  const worktree = await findWorktree(repo, target);
  if (!worktree) throw new NotFound("ワークツリーが見つかりません");
  const ok = (p: Promise<string>) => p.then((out) => out, () => "");
  // ワークツリーは一番上ごと消えるので、変更も一番上から数える
  const changes = worktree.prunable ? "" : await ok(gitOutput(worktree.root, ["status", "--porcelain"]));
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
  else await gitOutput(repo, ["worktree", "remove", ...(force ? ["--force"] : []), worktree.root]);
  if (deleteBranch && worktree.branch) await gitOutput(repo, ["branch", "-D", worktree.branch]);
  return listWorktrees(repo);
}
