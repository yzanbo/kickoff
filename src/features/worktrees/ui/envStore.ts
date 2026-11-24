// ワークツリーの実行環境（ポートの帯・組の名前）。中身は作業場所の一覧の店（土台の worktreesStore）の各行の env
import type { WorktreeEnv } from "@shared/worktrees/envTypes";
import { useWorktrees, worktreesStore } from "@/foundation/ui/workplace/worktreesStore";

/** ワークツリーの実行環境（一覧を読んでいない・本体・覚えのないワークツリー（Kickoff の外で作ったものなど）は null） */
export const worktreeEnvOf = (projectId: number, path: string | null): WorktreeEnv | null =>
  (path && worktreesStore.get(projectId).data?.find((w) => w.path === path)?.env) || null;

/** ワークツリーの実行環境（React から。一覧が変われば描き直す） */
export function useWorktreeEnv(projectId: number, path: string | null): WorktreeEnv | null {
  const list = useWorktrees(projectId);
  return (path && list?.find((w) => w.path === path)?.env) || null;
}
