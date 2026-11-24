// projects の口 projectGroups の実装（プロジェクトの画面は、グループの一覧が届くまで前のプロジェクトの画面を出す）
import type { ProjectGroups } from "@/features/projects/ui";
import { useKeyedStore } from "@/foundation/ui/store/useStore";
import { groupsStore } from "./stores/groups";

function useLoad(projectId: number) {
  const { loaded, loading, error } = useKeyedStore(groupsStore, projectId);
  return { loaded, loading, error };
}

export const groupsForProjects: ProjectGroups = { useLoad };
