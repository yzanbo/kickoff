import type { GitRefs, GitWorktree } from "@shared/types";

type Branch = GitRefs["branches"][number];

/** ワークツリーの行（そのワークツリーで取り出しているブランチ。ブランチから外れていれば undefined） */
export interface WorktreeRow {
  worktree: GitWorktree;
  branch?: Branch;
}

/**
 * 履歴の左の一覧のブランチを、取り出している作業場所で分ける。
 * 本体 = 本体で取り出しているブランチ（先頭）と、どこにも取り出していないブランチ / ワークツリー = 本体以外のワークツリーごとに、取り出しているブランチ。
 * match に合うものだけ（ワークツリーはブランチ名、ブランチがなければフォルダで絞る）
 */
export function groupBranches(branches: readonly Branch[], worktrees: readonly GitWorktree[], match: (name: string) => boolean): { main: Branch[]; worktrees: WorktreeRow[] } {
  const mainBranch = worktrees.find((w) => w.main)?.branch ?? null;
  const others = worktrees.filter((w) => !w.main);
  const inWorktree = new Set(others.map((w) => w.branch).filter((b): b is string => b !== null));
  const main = branches.filter((b) => !inWorktree.has(b.name) && match(b.name)).sort((a, b) => Number(b.name === mainBranch) - Number(a.name === mainBranch));
  const rows = others
    .filter((w) => match(w.branch ?? w.path))
    .map((worktree) => ({ worktree, ...(worktree.branch ? { branch: branches.find((b) => b.name === worktree.branch) } : {}) }));
  return { main, worktrees: rows };
}
