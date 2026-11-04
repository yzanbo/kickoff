import { useEffect, useSyncExternalStore } from "react";
import type { RunGroup } from "../../core/types";
import { api } from "./api";
import { subscribeServerEvent } from "./events";

// プロジェクトごとのグループの一覧（タブ・チャットの見出しにグループ名を出すため）。
// タブ・見出しがいくつあっても、取りに行くのはプロジェクトごとに 1 回。作る・名前を変える・消すはサーバーの知らせで直す
const cache = new Map<number, RunGroup[]>();
const loading = new Set<number>();
const listeners = new Set<() => void>();
let version = 0;
let watching = false;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

/** サーバーの知らせ（グループの作成・変更・削除）で、覚えている一覧を直す（最初に使ったときに 1 回だけつなぐ） */
function watch() {
  if (watching) return;
  watching = true;
  subscribeServerEvent((e) => {
    if (e.type === "group") {
      const list = cache.get(e.group.project_id);
      if (!list) return;
      cache.set(e.group.project_id, [...list.filter((g) => g.id !== e.group.id), e.group]);
      notify();
    } else if (e.type === "group_deleted") {
      const list = cache.get(e.project_id);
      if (!list) return;
      cache.set(
        e.project_id,
        list.filter((g) => g.id !== e.id),
      );
      notify();
    }
  });
}

function load(projectId: number) {
  watch();
  if (cache.has(projectId) || loading.has(projectId)) return;
  loading.add(projectId);
  api
    .groups(projectId)
    .catch(() => [] as RunGroup[])
    .then((list) => {
      cache.set(projectId, list);
      loading.delete(projectId);
      notify();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** いくつかのプロジェクトのグループの一覧を読み、変わったら描き直す */
function useLoadGroups(projectIds: number[]) {
  useSyncExternalStore(subscribe, () => version);
  const key = [...new Set(projectIds)].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (key) key.split(",").map(Number).forEach(load);
  }, [key]);
}

/** いくつかのプロジェクトのグループ名を引く（グループなし・読み込み中・もうないグループは undefined）。一覧が変わると描き直す */
export function useGroupNames(projectIds: number[]): (projectId: number, groupId: number | null | undefined) => string | undefined {
  useLoadGroups(projectIds);
  return (projectId, groupId) => (groupId == null ? undefined : cache.get(projectId)?.find((g) => g.id === groupId)?.name);
}

/** いくつかのプロジェクトのグループを、サイドバーと同じ並び（position の順）で引く（読み込み中は空）。一覧が変わると描き直す */
export function useProjectGroups(projectIds: number[]): (projectId: number) => RunGroup[] {
  useLoadGroups(projectIds);
  return (projectId) => [...(cache.get(projectId) ?? [])].sort((a, b) => a.position - b.position);
}

/** 1 つのチャットのグループ名（グループなし・読み込み中は undefined） */
export const useGroupName = (projectId: number, groupId: number | null | undefined) => useGroupNames([projectId])(projectId, groupId);
