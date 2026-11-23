// ワークツリー（同じリポジトリの別のブランチを、隣のフォルダに取り出す）と、作業場所の一覧・解決
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { GitWorktree } from "@shared/git/types";
import { git } from "./git";
import { gitPrefix, hasRef, isBranchName } from "./reads";
import { Invalid, NotFound } from "@/foundation/core/errors";
import { realPathOrSelf } from "@/foundation/core/system/paths";
import { timed } from "@/foundation/core/system/stallWatch";
import { ttlCache } from "@/foundation/core/system/ttlCache";

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

/** ワークツリーの一覧の覚え（repo ごとに 1 秒。?worktree= の頼みのたびに git worktree list を流さない。作った・消した・HEAD が変わったら forgetWorktrees） */
const worktreeLists = ttlCache<string, GitWorktree[]>({ ms: 1000, max: 64 });

/**
 * ワークツリーの一覧（repo はプロジェクトのフォルダ。リポジトリの中のフォルダなら、各ワークツリーの中の同じ位置を path にする）。
 * 1 秒覚える。fresh なら覚えを捨てて取り直す（消す・消す前の確かめなど、いまの形で決めるとき）
 */
export async function listWorktrees(repo: string, { fresh = false } = {}): Promise<GitWorktree[]> {
  if (fresh) forgetWorktrees(repo);
  const list = await worktreeLists.getOrLoad(repo, async () => {
    const [out, prefix] = await Promise.all([git(repo).run(["worktree", "list", "--porcelain"]), gitPrefix(repo)]);
    return readWorktrees(out, prefix ?? "");
  });
  // 覚えた一覧を使う所が書き換えないよう、写しを返す
  return list.map((w) => ({ ...w }));
}

/** 一覧の覚えを捨てる（ワークツリーを作った・消した・HEAD が変わったとき。worktrees の機能も呼ぶ） */
export function forgetWorktrees(repo: string): void {
  worktreeLists.invalidate(repo);
}

/** 出力を読む（同期の処理なので詰まりの見張りに名前を付ける。system/stallWatch.ts） */
const readWorktrees = timed("git:worktrees", parseWorktrees);

/** 作業場所（本体かワークツリー。path は realpath でそろえたもの） */
export interface Workplace {
  path: string;
  /** null = 本体 */
  worktree_path: string | null;
  branch: string | null;
}

/**
 * プロジェクトの本体とワークツリー（パスは realpath。片付け待ち（prunable）は除く）。Git が答えなければ本体だけ。
 * Docker タブ・AI の Docker の守り・AI の書き込み先の守りが使う
 */
export async function workplacesOf(repo: string): Promise<Workplace[]> {
  try {
    const wts = await listWorktrees(repo);
    return wts.filter((w) => !w.prunable).map((w) => ({ path: realPathOrSelf(w.path), worktree_path: w.main ? null : w.path, branch: w.branch }));
  } catch {
    return [{ path: realPathOrSelf(repo), worktree_path: null, branch: null }];
  }
}

/** フォルダのパス（作業するフォルダ = path）で、このリポジトリのワークツリーを探す（本体も含む。なければ undefined） */
export async function findWorktree(repo: string, folder: string): Promise<GitWorktree | undefined> {
  return (await listWorktrees(repo)).find((w) => w.path === folder);
}

/** フォルダ dir を、いちばん深く含む作業場所（パスはどちらも realpath でそろえたもの。なければ undefined） */
export function deepestWorkplace<T extends { path: string }>(dir: string, workplaces: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const w of workplaces) {
    const inside = dir === w.path || dir.startsWith(w.path.endsWith("/") ? w.path : `${w.path}/`);
    if (inside && (!best || w.path.length > best.path.length)) best = w;
  }
  return best;
}

/**
 * 作業場所の指定（?worktree= のワークツリーのフォルダ）を、このプロジェクトのワークツリーとして解決する。指定がなければ null（本体）。
 * このプロジェクトのワークツリーでなければ 400、フォルダが消えていれば（アプリの外で消された）404。
 * プロジェクトのフォルダがリポジトリの中のフォルダで、ワークツリーのブランチにそのフォルダがなければ（ブランチを切り替えたなど）、それも 404
 */
export async function requireWorktree(repo: string, worktree: string | undefined): Promise<GitWorktree | null> {
  if (!worktree) return null;
  const found = await findWorktree(repo, worktree);
  if (!found) throw new Invalid("このプロジェクトのワークツリーではありません");
  // 覚えた一覧のあとでフォルダが消されたもの（git なら prunable）も同じに断る
  if (found.prunable || !existsSync(found.root)) throw new NotFound("作業場所のフォルダが見つかりません（ワークツリーが消された可能性があります）");
  if (found.path !== found.root && !existsSync(found.path)) {
    throw new NotFound(`ワークツリー（${found.branch ?? found.root}）に、プロジェクトフォルダがありません（そのブランチにフォルダがまだコミットされていない可能性があります）`);
  }
  return found;
}

/** 操作するフォルダ（?worktree= があればそのワークツリー、なければ本体の repo） */
export async function resolveWorkdir(repo: string, worktree: string | undefined): Promise<string> {
  return (await requireWorktree(repo, worktree))?.path ?? repo;
}

/** リポジトリの一番上のフォルダ（実体のパス） */
export const repoTop = async (repo: string) => fs.realpath(await git(repo).text(["rev-parse", "--show-toplevel"]));

/** 新しいワークツリーを置く一番上のフォルダ（リポジトリの一番上の隣の <名前>-worktrees/<ブランチ名>。/ は - にする。作るのは worktrees の機能） */
export async function worktreeRootFor(repo: string, branch: string): Promise<string> {
  const root = await repoTop(repo);
  return path.join(path.dirname(root), `${path.basename(root)}-worktrees`, branch.replace(/[\\/]+/g, "-"));
}

/** 新しいワークツリーで作業するフォルダ（一番上は worktreeRootFor。プロジェクトのフォルダがリポジトリの中のフォルダなら、その中の同じ位置） */
export async function worktreePathFor(repo: string, branch: string): Promise<string> {
  const [root, prefix] = await Promise.all([worktreeRootFor(repo, branch), gitPrefix(repo)]);
  return prefix ? path.join(root, prefix) : root;
}

/**
 * 新しいブランチでワークツリーを作れるかの確かめ（AI の create_chat が、承認を聞く前に断るため）。作れなければ理由の文、作れれば null。
 * 断るのは、名前に使えない文字・同じ名前のブランチがある・置き場所のフォルダがある（使い回さない。AI には新しいブランチだけを作らせる）
 */
export async function newWorktreeProblem(repo: string, branch: string): Promise<string | null> {
  if (!(await isBranchName(branch))) return `ブランチの名前「${branch}」に使えない文字があります`;
  if (await hasRef(repo, `refs/heads/${branch}`)) return `同じ名前のブランチ「${branch}」がもうあります。別の名前にしてください`;
  const target = await worktreeRootFor(repo, branch);
  if (await fs.stat(target).catch(() => null)) return `ワークツリーを置くフォルダがもうあります: ${target}`;
  return null;
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
  forgetWorktrees(oldRepo);
  forgetWorktrees(newRepo);
  return moves;
}

/**
 * ワークツリーを消す（本体は消せない。force: コミットしていない変更があっても消す）。フォルダがアプリの外で消されていれば、Git の記録だけを消す。
 * deleteBranch なら、取り出していたブランチも -D で消す（プッシュしていないコミットがあっても消すので、画面で確かめてから呼ぶ。
 * PR がマージされたあとの片付けもこれ: GitHub で squash などでマージすると、手元では「マージ済み」にならないため）
 */
export async function removeWorktree(repo: string, target: string, { force = false, deleteBranch = false } = {}): Promise<GitWorktree[]> {
  const worktree = (await listWorktrees(repo, { fresh: true })).find((w) => w.path === target);
  if (!worktree) throw new NotFound("ワークツリーが見つかりません");
  if (worktree.main) throw new Invalid("本体のフォルダは消せません");
  if (worktree.prunable) await git(repo).run(["worktree", "prune"]);
  else await git(repo).run(["worktree", "remove", ...(force ? ["--force"] : []), worktree.root]);
  forgetWorktrees(repo);
  if (deleteBranch && worktree.branch) await git(repo).run(["branch", "-D", worktree.branch]);
  return listWorktrees(repo);
}
