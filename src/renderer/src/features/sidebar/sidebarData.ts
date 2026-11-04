import type { Run, RunGroup } from "@shared/types";

/** プロジェクトごとのチャット・グループ（useSidebarData が持つ形） */
export type RunsByProject = Record<number, Run[]>;
export type GroupsByProject = Record<number, RunGroup[]>;

const byPosition = (a: RunGroup, b: RunGroup) => a.position - b.position || a.id - b.id;
const byActive = (a: Run, b: Run) => b.active_at.localeCompare(a.active_at);

/** サーバーから届いたチャットを、そのプロジェクトの一覧に入れる（同じ ID は置き換え、新しく動いた順に並べ直す） */
export function upsertRun(prev: RunsByProject, run: Run): RunsByProject {
  const list = prev[run.project_id] ?? [];
  const next = { ...prev, [run.project_id]: [run, ...list.filter((r) => r.id !== run.id)].sort(byActive) };
  // ほかのプロジェクトへ移したチャットは、元のプロジェクトの一覧から外す
  for (const [key, runs] of Object.entries(prev)) {
    if (Number(key) !== run.project_id && runs.some((r) => r.id === run.id)) next[Number(key)] = runs.filter((r) => r.id !== run.id);
  }
  return next;
}

/** 削除されたチャットを一覧から消す */
export function removeRun(prev: RunsByProject, projectId: number, id: number): RunsByProject {
  return { ...prev, [projectId]: (prev[projectId] ?? []).filter((r) => r.id !== id) };
}

/** サーバーから届いたグループを、そのプロジェクトの一覧に入れる（同じ ID は置き換え、並び順どおりに） */
export function upsertGroup(prev: GroupsByProject, group: RunGroup): GroupsByProject {
  const list = [group, ...(prev[group.project_id] ?? []).filter((g) => g.id !== group.id)];
  return { ...prev, [group.project_id]: list.sort(byPosition) };
}

/** 削除されたプロジェクトの分を消す（消えたチャットが「ある」ものとして残らないように） */
export function dropProject<T>(prev: Record<number, T>, projectId: number): Record<number, T> {
  if (!(projectId in prev)) return prev;
  const { [projectId]: _, ...rest } = prev;
  return rest;
}

/** 削除されたグループを一覧から消す */
export function removeGroup(prev: GroupsByProject, projectId: number, id: number): GroupsByProject {
  return { ...prev, [projectId]: (prev[projectId] ?? []).filter((g) => g.id !== id) };
}
