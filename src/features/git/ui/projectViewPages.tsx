// git がプロジェクトの画面の表（projectViews）に出す画面の中身: 変更のタブの数・履歴（変更の中身は files の EditorViewPage）
import { useBusyBadge } from "@/foundation/ui/hooks/useBusyBadge";
import type { ProjectViewBadge, ProjectViewBadgeProps, ProjectViewContext } from "@/features/projects/ui";
import { HistoryTab } from "./history/HistoryTab";
import { useGitStatus } from "./useGitStatus";

export const HistoryViewPage = ({ project, worktree, setWorktree }: ProjectViewContext) => (
  <HistoryTab key={worktree ?? ""} projectId={project.id} worktree={worktree ?? undefined} onWorktreeChange={(next) => setWorktree(next ?? null)} />
);

/** 変更のタブの数（変更のあるファイル。取り直している最中は数の代わりに更新中の印） */
export function useChangesBadge({ projectId, worktree, vertical }: ProjectViewBadgeProps): ProjectViewBadge {
  const git = useGitStatus(projectId, false, worktree);
  const refreshing = useBusyBadge(git.refreshing);
  const label = `変更のあるファイル ${git.count} 件`;
  return {
    label: git.count > 0 ? label : null,
    refreshing,
    node: git.count > 0 && (
      <span className="change-count" aria-label={vertical ? undefined : label}>
        {git.count}
      </span>
    ),
  };
}
