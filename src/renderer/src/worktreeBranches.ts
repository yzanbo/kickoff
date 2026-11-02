import { useEffect, useSyncExternalStore } from "react";
import type { GitWorktree, Run } from "../../core/types";
import { api } from "./api";
import { useWindowEvent } from "./hooks/useWindowEvent";

/** 取り直すまでの間隔（ブランチは時々しか変わらないので、見ている間だけ・ウィンドウに戻ったときに取り直す） */
const MAX_AGE_MS = 30_000;

// プロジェクトごとのワークツリー（本体を含む）の一覧。カード・行がいくつあっても、取りに行くのはプロジェクトごとに 1 回
const cache = new Map<number, { list: GitWorktree[]; at: number }>();
const loading = new Set<number>();
const listeners = new Set<() => void>();

function refresh(projectId: number) {
  const hit = cache.get(projectId);
  if (loading.has(projectId) || (hit && Date.now() - hit.at < MAX_AGE_MS)) return;
  loading.add(projectId);
  api
    .gitWorktrees(projectId)
    .catch(() => [] as GitWorktree[])
    .then((list) => {
      cache.set(projectId, { list, at: Date.now() });
      loading.delete(projectId);
      listeners.forEach((l) => l());
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * チャットが作業しているブランチ（作業場所のワークツリー。空なら本体）。
 * 分からないうち・Git でないフォルダは null。ブランチから外れていれば "HEAD a1b2c3d" のように出す
 */
export function useRunBranch(run: Pick<Run, "project_id" | "worktree_path">): string | null {
  const list = useSyncExternalStore(subscribe, () => cache.get(run.project_id)?.list);
  useEffect(() => refresh(run.project_id), [run.project_id]);
  useWindowEvent("focus", () => refresh(run.project_id));
  const wt = list?.find((w) => (run.worktree_path ? w.path === run.worktree_path : w.main));
  if (!wt) return null;
  return wt.branch ?? `HEAD ${wt.head.slice(0, 7)}`;
}
