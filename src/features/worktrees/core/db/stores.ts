import type { DatabaseSync } from "node:sqlite";
import { createWorktreeColorStore } from "./worktreeColors";
import { createWorktreeEnvStore } from "./worktreeEnvs";

/** ワークツリーの表の店（実行環境と色。同じ worktrees の表）。createWorktrees が作る */
export function createWorktreeStores(db: DatabaseSync) {
  return { worktreeEnvs: createWorktreeEnvStore(db), worktreeColors: createWorktreeColorStore(db) };
}

export type WorktreeStores = ReturnType<typeof createWorktreeStores>;
