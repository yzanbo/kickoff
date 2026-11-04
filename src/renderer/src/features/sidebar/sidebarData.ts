import type { ChatGroup } from "@shared/types";

/** プロジェクトごとのグループ（useSidebarData が持つ形） */
export type GroupsByProject = Record<number, ChatGroup[]>;

const byPosition = (a: ChatGroup, b: ChatGroup) => a.position - b.position || a.id - b.id;
/** サーバーから届いたグループを、そのプロジェクトの一覧に入れる（同じ ID は置き換え、並び順どおりに） */
export function upsertGroup(prev: GroupsByProject, group: ChatGroup): GroupsByProject {
  const list = [group, ...(prev[group.project_id] ?? []).filter((g) => g.id !== group.id)];
  return { ...prev, [group.project_id]: list.sort(byPosition) };
}

/** 削除されたプロジェクトの分を消す（消えたグループが「ある」ものとして残らないように） */
export function dropProject<T>(prev: Record<number, T>, projectId: number): Record<number, T> {
  if (!(projectId in prev)) return prev;
  const { [projectId]: _, ...rest } = prev;
  return rest;
}

/** 削除されたグループを一覧から消す */
export function removeGroup(prev: GroupsByProject, projectId: number, id: number): GroupsByProject {
  return { ...prev, [projectId]: (prev[projectId] ?? []).filter((g) => g.id !== id) };
}
