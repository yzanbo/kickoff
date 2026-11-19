import { withQuery, type Query } from "./http";

/** Git・ファイル・検索・/ のコマンドの操作先（プロジェクトの番号だけなら本体。worktree があればそのワークツリー） */
export type GitTarget = number | { projectId: number; worktree?: string };

/** 作業場所の API のパス（/api/projects/:id<path>。ワークツリーなら ?worktree=、なければ本体） */
export function workdirPath(target: GitTarget, path: string, query: Query = {}): string {
  const { projectId, worktree } = typeof target === "number" ? { projectId: target, worktree: undefined } : target;
  return withQuery(`/api/projects/${projectId}${path}`, { ...query, worktree });
}
