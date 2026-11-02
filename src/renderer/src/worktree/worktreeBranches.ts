import { useEffect, useSyncExternalStore } from "react";
import type { GitWorktree, Run } from "../../../core/types";
import { branchName, workplaceOf, type RunWorkplace } from "./workplace";
import { api } from "../api";
import { useWindowEvent } from "../hooks/useWindowEvent";

/** 取り直すまでの間隔（ブランチは時々しか変わらないので、見ている間だけ・ウィンドウに戻ったときに取り直す） */
const MAX_AGE_MS = 30_000;

// プロジェクトごとのワークツリー（本体を含む）の一覧。カード・行がいくつあっても、取りに行くのはプロジェクトごとに 1 回
const cache = new Map<number, { list: GitWorktree[]; at: number }>();
const loading = new Set<number>();
const listeners = new Set<() => void>();
// 一覧が変わるたびに進める（描き直しの合図）
let version = 0;

function notify() {
  version++;
  listeners.forEach((l) => l());
}

/** 古くなっていれば取り直す（30 秒以内に取っていれば何もしない。取っている途中なら待つ） */
export function refreshWorktrees(projectId: number) {
  const hit = cache.get(projectId);
  if (loading.has(projectId) || (hit && Date.now() - hit.at < MAX_AGE_MS)) return;
  loading.add(projectId);
  api
    .gitWorktrees(projectId)
    .catch(() => [] as GitWorktree[])
    .then((list) => {
      cache.set(projectId, { list, at: Date.now() });
      loading.delete(projectId);
      notify();
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** ワークツリーを作った・片付けた・消したあとに呼ぶ（いまの一覧を古いことにして、すぐ取り直す。届くまでは前の一覧を出しておく） */
export function invalidateWorktrees(projectId: number) {
  const hit = cache.get(projectId);
  if (hit) cache.set(projectId, { ...hit, at: 0 });
  refreshWorktrees(projectId);
}

/** 操作の結果として届いた一覧をそのまま覚える（ワークツリーを作る・消す API はいまの一覧を返す） */
export function setWorktreeList(projectId: number, list: GitWorktree[]) {
  cache.set(projectId, { list, at: Date.now() });
  notify();
}

/** いくつかのプロジェクトのワークツリーの一覧（読み込み中は undefined）。一覧が変わると描き直す */
export function useWorktreeLists(projectIds: number[]): (projectId: number) => GitWorktree[] | undefined {
  useSyncExternalStore(subscribe, () => version);
  const key = [...new Set(projectIds)].sort((a, b) => a - b).join(",");
  const ids = () => (key ? key.split(",").map(Number) : []);
  useEffect(() => ids().forEach(refreshWorktrees), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useWindowEvent("focus", () => ids().forEach(refreshWorktrees));
  return (projectId) => cache.get(projectId)?.list;
}

export const useWorktreeList = (projectId: number) => useWorktreeLists([projectId])(projectId);

/** 本体がいまいるブランチ（分からないうち・Git でないフォルダは null。ブランチから外れていれば "HEAD a1b2c3d"） */
export function useMainBranch(projectId: number): string | null {
  const main = useWorktreeList(projectId)?.find((w) => w.main);
  return main ? branchName(main) : null;
}

/** チャットの作業場所とブランチ（workplaceOf を、そのプロジェクトのワークツリーの一覧で求める） */
export function useRunWorkplace(run: Pick<Run, "project_id" | "worktree_path" | "branch">): RunWorkplace {
  return workplaceOf(run, useWorktreeList(run.project_id));
}
