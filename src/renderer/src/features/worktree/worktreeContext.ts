import { createContext, useContext, useMemo } from "react";
import type { GitTarget } from "@/api";

/** エディタタブで見ている作業場所（ワークツリーのフォルダ。undefined なら本体） */
export const WorktreeContext = createContext<string | undefined>(undefined);

/**
 * いま見ている作業場所に向けた、Git・ファイル・検索の操作先。
 * key は作業場所が変わったら読み直すための文字（effect の依存や、覚えた結果の見分けに使う）
 */
export function useGitTarget(projectId: number, worktree = useContext(WorktreeContext)) {
  return useMemo(() => ({ target: { projectId, worktree } as GitTarget, key: `${projectId}:${worktree ?? ""}`, worktree }), [projectId, worktree]);
}
