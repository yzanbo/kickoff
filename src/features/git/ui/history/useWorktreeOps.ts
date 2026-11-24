import type { GitWorktree } from "@shared/foundation/workplace";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { workplaceActions, type WorkplaceActions } from "@/foundation/ui/workplace/workplaceDecor";
import type { GitLogController } from "./useGitLog";

/**
 * 履歴の左の一覧のワークツリーの操作（作る・消す。中身は作業場所の飾りの actions = worktrees が登録。登録がなければ何もしない）。
 * 済んだら履歴を取り直し、失敗の文は error に出す
 */
export function useWorktreeOps(projectId: number, log: GitLogController) {
  const worktreeError = useAction();
  const actions = workplaceActions();
  const run = (job: (a: WorkplaceActions) => Promise<boolean>) =>
    worktreeError.guard(async () => {
      if (actions && (await job(actions))) log.refresh();
    });
  return {
    error: worktreeError.error,
    createWorktree: () => run((a) => a.create(projectId)),
    removeWorktree: (w: GitWorktree) => run((a) => a.remove(projectId, w)),
  };
}

export type WorktreeOps = ReturnType<typeof useWorktreeOps>;
