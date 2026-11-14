// Kickoff のゴミ箱。プロジェクトごとの一覧（プロジェクトの「ゴミ箱」タブ）と、ゴミ箱のプロジェクト・どのプロジェクトにも出ないもの（設定の「ゴミ箱と整理」）。
// 入れた・戻した・消えたら知らせ（trash）で取り直す。期限（3 日）で消えたものも片付けの知らせで届く
import type { TrashItem } from "@shared/types";
import { api } from "@/api";
import { createStore } from "./createStore";
import { createKeyedStore } from "./keyedStore";
import { useKeyedStore, useStore } from "./useStore";

const projectTrashStore = createKeyedStore<number, TrashItem[]>({
  load: (projectId) => api.projectTrash(projectId),
  // AI の kickoff-trash で入れたものは、コアが一覧を読むときに取り込むので、戻ったときにも取り直す
  refreshOnFocus: true,
  reloadOn: (e, projectId) => e.type === "trash" && (e.project_id === projectId || e.project_id === null),
  dropOn: (e) => (e.type === "project_deleted" ? e.id : undefined),
});

const trashedProjectsStore = createStore<TrashItem[]>({
  load: () => api.trashedProjects(),
  reloadOn: (e) => e.type === "trash" || e.type === "project_deleted" || e.type === "project",
});

const unassignedTrashStore = createStore<TrashItem[]>({
  load: () => api.unassignedTrash(),
  reloadOn: (e) => e.type === "trash" && e.project_id === null,
});

/** そのプロジェクトのゴミ箱（active が false なら読みに行かない） */
export const useProjectTrash = (projectId: number, active = true) => useKeyedStore(projectTrashStore, projectId, { active });

/** ゴミ箱のプロジェクト */
export const useTrashedProjects = (active = true) => useStore(trashedProjectsStore, { active });

/** どのプロジェクトにも出ないもの（プロジェクトの外の会話記録など） */
export const useUnassignedTrash = (active = true) => useStore(unassignedTrashStore, { active });
