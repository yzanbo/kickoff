// プロジェクトごとのワークツリー（本体を含む）の一覧。カード・行がいくつあっても、取りに行くのはプロジェクトごとに 1 回。
// ブランチは Kickoff の外でも変わるので、30 秒たってから使ったとき・ウィンドウに戻ったときに取り直す（届くまでは前の一覧を出す）。
// ワークツリーを作る・消す API はそのあとの一覧を返すので、それを set で入れる（作った・片付けたあとは invalidate ですぐ取り直す）
import { useMemo } from "react";
import type { GitWorktree } from "@shared/types";
import { api } from "@/api";
import { createKeyedStore } from "./keyedStore";
import { useKeyedStore, useKeyedStores } from "./useStore";

/** 取り直すまでの間隔（見ている間だけ・ウィンドウに戻ったときに取り直す） */
const MAX_AGE_MS = 30_000;

export const worktreesStore = createKeyedStore<number, GitWorktree[]>({
  load: (projectId) => api.gitWorktrees(projectId),
  maxAge: MAX_AGE_MS,
  refreshOnFocus: true,
  dropOn: (e) => (e.type === "project_deleted" ? e.id : undefined),
});

/** そのプロジェクトのワークツリーの一覧（読み込み中・読めなかったときは undefined） */
export const useWorktrees = (projectId: number): GitWorktree[] | undefined => useKeyedStore(worktreesStore, projectId).data;

/** いくつかのプロジェクトのワークツリーの一覧を引く関数（読み込み中は undefined。どれかが変わると新しい関数になる） */
export function useWorktreesOf(projectIds: readonly number[]): (projectId: number) => GitWorktree[] | undefined {
  const get = useKeyedStores(worktreesStore, projectIds);
  return useMemo(() => (projectId: number) => get(projectId).data, [get]);
}
