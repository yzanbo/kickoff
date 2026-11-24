// プロジェクトごとのワークツリー（本体を含む）の一覧。カード・行がいくつあっても、取りに行くのはプロジェクトごとに 1 回。
// ブランチは Kickoff の外でも変わるので、コアの HEAD の見張りの知らせ（worktrees_changed）ですぐ取り直す。見張りが漏れたときの備えに、
// 表示している間は 30 秒ごと・ウィンドウに戻ったときにも取り直す（届くまでは前の一覧を出す）。
// ワークツリーを作る・消す API はそのあとの一覧を返すので、それを set で入れる（作った・片付けたあとは invalidate ですぐ取り直す）
import type { GitWorktree } from "@shared/foundation/workplace";
import { definePoint } from "@/foundation/ui/points";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { useKeyedStore, useKeyedStores } from "@/foundation/ui/store/useStore";

/** ワークツリーを読む・作る口（ルートの持ち主の worktrees が 1 つだけ登録する。土台と worktrees より下の機能はこれを通す） */
export interface WorktreeSource {
  /** 本体を含む一覧 */
  list(projectId: number): Promise<GitWorktree[]>;
  /** ブランチをワークツリーとして取り出す（作ったあとの一覧が返る） */
  add(projectId: number, branch: string): Promise<GitWorktree[]>;
  /** やりたいことの文から、新しいブランチ名の案を AI に作ってもらう */
  suggestBranches(projectId: number, summary: string): Promise<string[]>;
}

export const worktreeSources = definePoint<WorktreeSource>("worktreeSources");

const missing = () => Promise.reject(new Error("ワークツリーの口（worktreeSources）が登録されていない"));
const NO_SOURCE: WorktreeSource = { list: missing, add: missing, suggestBranches: missing };

/** 登録された口（登録がなければ、どれも失敗を返す口） */
export const worktreeSource = (): WorktreeSource => worktreeSources.items()[0] ?? NO_SOURCE;

/** 取り直すまでの間隔（見ている間だけ・ウィンドウに戻ったときに取り直す） */
const MAX_AGE_MS = 30_000;

export const worktreesStore = createKeyedStore<number, GitWorktree[]>({
  load: (projectId) => worktreeSource().list(projectId),
  maxAge: MAX_AGE_MS,
  refreshAfterMaxAge: true,
  refreshOnFocus: "always",
  reloadOn: { worktrees_changed: (event, projectId) => event.project_id === projectId },
  dropOn: { project_deleted: (e) => e.id },
});

/** そのプロジェクトのワークツリーの一覧（読み込み中・読めなかったときは undefined） */
export const useWorktrees = (projectId: number): GitWorktree[] | undefined => useKeyedStore(worktreesStore, projectId).data;

/** いくつかのプロジェクトのワークツリーの一覧を引く関数（読み込み中は undefined。どれかが変わると新しい関数になる） */
export function useWorktreesOf(projectIds: readonly number[]): (projectId: number) => GitWorktree[] | undefined {
  const get = useKeyedStores(worktreesStore, projectIds);
  return (projectId: number) => get(projectId).data;
}
