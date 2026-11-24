import { useEffect } from "react";
import type { ProjectFiles } from "@shared/foundation/fileTypes";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore } from "@/foundation/ui/store/useStore";
import type { KeyedStore, StoreState } from "@/foundation/ui/store/storeTypes";
import { workdirInput } from "@/foundation/ui/api/workdir";
import { workplaceKey, type WorkplaceRef } from "@/foundation/ui/workplace/workplace";
import { filesApi } from "./api";

/** key（workplaceKey = "<projectId>:<worktree>"）からの作業場所 */
function workplaceOf(key: string): WorkplaceRef {
  const at = key.indexOf(":");
  return { projectId: Number(key.slice(0, at)), worktree: key.slice(at + 1) || null };
}

/** 取り直した一覧が前と同じか（同じなら前の値のまま。描き直さない） */
const sameFiles = (a: ProjectFiles, b: ProjectFiles) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 作業場所ごとのファイルの一覧（エクスプローラーの木と、チャットの返答のファイルのリンクが読む。読む所がいくつあっても取得は 1 回）。
 * 中身が同じなら前の値のまま返す
 */
const filesStore: KeyedStore<string, ProjectFiles> = createKeyedStore<string, ProjectFiles>({
  load: async (key): Promise<ProjectFiles> => {
    const next = await filesApi("GET /api/projects/:projectId/files", workdirInput(workplaceOf(key)));
    const prev = filesStore.get(key).data;
    return prev && sameFiles(prev, next) ? prev : next;
  },
});

/**
 * 作業場所のファイルの一覧を読む。使い始めたとき・version（Git の状態の version・チャットの状態）が変わったときに取り直す
 * （ほかで作ったファイルも拾う）。active でない間は取りに行かない
 */
export function useWorkplaceFiles(target: WorkplaceRef, { active = true, version }: { active?: boolean; version: unknown }): StoreState<ProjectFiles> {
  const key = workplaceKey(target);
  // 店を使い始める（useKeyedStore の retain）より前に古いことにしておき、届いている値を出したまま取り直す
  useEffect(() => {
    if (active) filesStore.invalidate(key);
  }, [key, active, version]);
  return useKeyedStore(filesStore, key, { active });
}
