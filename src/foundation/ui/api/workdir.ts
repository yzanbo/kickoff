import type { WorkdirQuery } from "@shared/foundation/contract";
import { withQuery, type Query } from "./http";

/** Git・ファイル・検索・/ のコマンドの操作先（プロジェクトの番号だけなら本体。worktree があればそのワークツリー。作業場所 WorkplaceRef もそのまま渡せる） */
export type GitTarget = number | { projectId: number; worktree?: string | null };

const placeOf = (target: GitTarget) => (typeof target === "number" ? { projectId: target, worktree: undefined } : { projectId: target.projectId, worktree: target.worktree ?? undefined });

/** 作業場所の API のパス（/api/projects/:id<path>。ワークツリーなら ?worktree=、なければ本体） */
export function workdirPath(target: GitTarget, path: string, query: Query = {}): string {
  const { projectId, worktree } = placeOf(target);
  return withQuery(`/api/projects/${projectId}${path}`, { ...query, worktree });
}

/** 取り決めの作業場所のルート（workdir: true）の入力（:projectId と ?worktree=。ほかのクエリがあれば重ねる） */
export function workdirInput<Q extends object = {}>(target: GitTarget, query?: Q): { params: { projectId: number }; query: Q & WorkdirQuery } {
  const { projectId, worktree } = placeOf(target);
  return { params: { projectId }, query: { ...(query as Q), worktree } };
}
