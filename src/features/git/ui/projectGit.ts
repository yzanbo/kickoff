// projects の口 projectGit の実装（プロジェクトの設定の「git の管理を始める…」の出し分け）
import type { ProjectGit } from "@/features/projects/ui";
import type { WorkplaceRef } from "@/foundation/ui/workplace/workplace";
import { useGitStatus } from "./useGitStatus";

function useRepo(target: WorkplaceRef) {
  const git = useGitStatus(target);
  return { plain: git.status?.repo === false, refresh: () => void git.refresh() };
}

export const gitForProjects: ProjectGit = { useRepo };
