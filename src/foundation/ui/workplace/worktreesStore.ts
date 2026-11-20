// プロジェクトごとのワークツリー（本体を含む）の一覧。カード・行がいくつあっても、取りに行くのはプロジェクトごとに 1 回。
// ブランチは Kickoff の外でも変わるので、コアの HEAD の見張りの知らせ（worktrees_changed）ですぐ取り直す。見張りが漏れたときの備えに、
// 表示している間は 30 秒ごと・ウィンドウに戻ったときにも取り直す（届くまでは前の一覧を出す）。
// ワークツリーを作る・消す API はそのあとの一覧を返すので、それを set で入れる（作った・片付けたあとは invalidate ですぐ取り直す）
import type { GitWorktree } from "@shared/git/types";
import type { WorktreeEnv } from "@shared/worktrees/envTypes";
import { api } from "@/foundation/ui/api";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore, useKeyedStores } from "@/foundation/ui/store/useStore";

/** 取り直すまでの間隔（見ている間だけ・ウィンドウに戻ったときに取り直す） */
const MAX_AGE_MS = 30_000;

export const worktreesStore = createKeyedStore<number, GitWorktree[]>({
  load: (projectId) => api.gitWorktrees(projectId),
  maxAge: MAX_AGE_MS,
  refreshAfterMaxAge: true,
  refreshOnFocus: "always",
  reloadOn: { worktrees_changed: (event, projectId) => event.project_id === projectId },
  dropOn: { project_deleted: (e) => e.id },
});

/** そのプロジェクトのワークツリーの一覧（読み込み中・読めなかったときは undefined） */
export const useWorktrees = (projectId: number): GitWorktree[] | undefined => useKeyedStore(worktreesStore, projectId).data;

/** ワークツリーの実行環境（ポートの帯・組の名前。一覧を読んでいない・本体・覚えのないワークツリー（Kickoff の外で作ったものなど）は null） */
export const worktreeEnvOf = (projectId: number, path: string | null): WorktreeEnv | null =>
  (path && worktreesStore.get(projectId).data?.find((w) => w.path === path)?.env) || null;

/** ワークツリーの実行環境（React から。一覧が変われば描き直す） */
export function useWorktreeEnv(projectId: number, path: string | null): WorktreeEnv | null {
  const list = useWorktrees(projectId);
  return (path && list?.find((w) => w.path === path)?.env) || null;
}

/** いくつかのプロジェクトのワークツリーの一覧を引く関数（読み込み中は undefined。どれかが変わると新しい関数になる） */
export function useWorktreesOf(projectIds: readonly number[]): (projectId: number) => GitWorktree[] | undefined {
  const get = useKeyedStores(worktreesStore, projectIds);
  return (projectId: number) => get(projectId).data;
}
