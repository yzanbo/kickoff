import { GitBranch } from "lucide-react";
import type { Run } from "../../../core/types";
import { cx } from "../cx";
import { useRunBranch } from "../worktreeBranches";

/**
 * チャットが作業しているブランチの印（すべてのチャットに出す）。ワークツリーで作業しているチャットは色を付け、
 * 本体のチャットは控えめにする。ブランチが分からないうちは、ワークツリーならフォルダ名を出す
 */
export function WorktreeChip({ run }: { run: Pick<Run, "project_id" | "worktree_path"> }) {
  const branch = useRunBranch(run);
  const folder = run.worktree_path ? run.worktree_path.split("/").pop() : null;
  const label = branch ?? folder;
  if (!label) return null;
  const place = run.worktree_path ? `ワークツリー（${run.worktree_path}）` : "本体";
  return (
    <span className={cx("worktree-chip", !run.worktree_path && "on-main")} title={`ブランチ: ${branch ?? "不明"}\n作業場所: ${place}`}>
      <GitBranch size={11} aria-hidden />
      {label}
    </span>
  );
}
