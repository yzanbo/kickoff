import { FolderGit2 } from "lucide-react";
import type { Run } from "../../../core/types";

/** チャットの作業場所（ワークツリー）の印。本体で作業しているチャットには出さない */
export function WorktreeChip({ run }: { run: Pick<Run, "worktree_path"> }) {
  if (!run.worktree_path) return null;
  return (
    <span className="worktree-chip" title={`作業場所: ${run.worktree_path}`}>
      <FolderGit2 size={11} aria-hidden />
      {run.worktree_path.split("/").pop()}
    </span>
  );
}
