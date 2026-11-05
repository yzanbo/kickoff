// プロジェクトごとのグループの一覧（サイドバー・プロジェクトの画面・タブの列・チャットの見出し・新しいチャットで共通）。
// 使い始めたときにプロジェクトごとに 1 回読み、作る・名前を変える・並べ替える・消すはサーバーの知らせで直す。並びはサイドバーと同じ（position → id）
import { useMemo } from "react";
import type { BusEvent, ChatGroup } from "@shared/types";
import { api } from "@/api";
import { createKeyedStore } from "./keyedStore";
import { useKeyedStore, useKeyedStores } from "./useStore";

/** グループのないプロジェクト・読み込み中の空の一覧（描くたびに作らない。書き換えない） */
export const NO_GROUPS: ChatGroup[] = Object.freeze([]) as unknown as ChatGroup[];

const byPosition = (a: ChatGroup, b: ChatGroup) => a.position - b.position || a.id - b.id;

/** 知らせでそのプロジェクトのグループの一覧を直す（作った・変えたものは並び順の位置へ。関係なければ同じ一覧） */
export function reduceGroups(list: ChatGroup[], event: BusEvent, projectId: number): ChatGroup[] {
  if (event.type === "group" && event.group.project_id === projectId) return [...list.filter((g) => g.id !== event.group.id), event.group].sort(byPosition);
  if (event.type === "group_deleted" && event.project_id === projectId && list.some((g) => g.id === event.id)) return list.filter((g) => g.id !== event.id);
  return list;
}

export const groupsStore = createKeyedStore<number, ChatGroup[]>({
  load: (projectId) => api.groups(projectId),
  reduce: reduceGroups,
  dropOn: (e) => (e.type === "project_deleted" ? e.id : undefined),
});

/** そのプロジェクトのグループ（読み込み中・グループのないプロジェクトは空） */
export const useGroups = (projectId: number | undefined): ChatGroup[] => useKeyedStore(groupsStore, projectId).data ?? NO_GROUPS;

/** いくつかのプロジェクトのグループを引く関数（読み込み中は空。どれかが変わると新しい関数になる） */
export function useGroupsOf(projectIds: readonly number[]): (projectId: number) => ChatGroup[] {
  const get = useKeyedStores(groupsStore, projectIds);
  return useMemo(() => (projectId: number) => get(projectId).data ?? NO_GROUPS, [get]);
}

/** グループ名（グループなし・読み込み中・もうないグループは undefined） */
export const groupNameIn = (groups: readonly ChatGroup[], groupId: number | null | undefined): string | undefined =>
  groupId == null ? undefined : groups.find((g) => g.id === groupId)?.name;

/** 1 つのチャットのグループ（名前と色。グループなし・読み込み中・もうないグループは undefined） */
export const useGroup = (projectId: number, groupId: number | null | undefined): ChatGroup | undefined => {
  const groups = useGroups(projectId);
  return groupId == null ? undefined : groups.find((g) => g.id === groupId);
};
