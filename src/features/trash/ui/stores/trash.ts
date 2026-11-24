// Kickoff のゴミ箱。プロジェクトごとの一覧（プロジェクトの「ゴミ箱」タブ）と、ゴミ箱のプロジェクト・どのプロジェクトにも出ないもの（設定の「ゴミ箱と整理」）。
// 入れた・戻した・消えたら知らせ（trash）で取り直す。期限（3 日）で消えたものも片付けの知らせで届く
import type { TrashItem } from "@shared/trash/types";
import { trashApi } from "@/features/trash/ui/api";
import { createStore } from "@/foundation/ui/store/createStore";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore, useStore } from "@/foundation/ui/store/useStore";

const projectTrashStore = createKeyedStore<number, TrashItem[]>({
  load: (projectId) => trashApi("GET /api/projects/:projectId/trash", { params: { projectId } }),
  // AI の kickoff-trash で入れたものは、コアが一覧を読むときに取り込むので、戻ったときにも取り直す
  refreshOnFocus: true,
  reloadOn: { trash: (e, projectId) => e.project_id === projectId || e.project_id === null },
  dropOn: { project_deleted: (e) => e.id },
});

const trashedProjectsStore = createStore<TrashItem[]>({
  load: () => trashApi("GET /api/trash/projects"),
  reloadOn: { trash: true, project_deleted: true, project: true },
});

const unassignedTrashStore = createStore<TrashItem[]>({
  load: () => trashApi("GET /api/trash/unassigned"),
  reloadOn: { trash: (e) => e.project_id === null },
});

/** そのプロジェクトのゴミ箱（active が false なら読みに行かない） */
export const useProjectTrash = (projectId: number, active = true) => useKeyedStore(projectTrashStore, projectId, { active });

/** ゴミ箱のプロジェクト */
export const useTrashedProjects = (active = true) => useStore(trashedProjectsStore, { active });

/** どのプロジェクトにも出ないもの（プロジェクトの外の会話記録など） */
export const useUnassignedTrash = (active = true) => useStore(unassignedTrashStore, { active });
