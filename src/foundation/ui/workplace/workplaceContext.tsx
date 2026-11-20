import { createContext, useContext, type ReactNode } from "react";
import type { GitTarget } from "@/foundation/ui/api";
import { workplaceKey, type WorkplaceRef } from "./workplace";

const WorkplaceContext = createContext<WorkplaceRef | null>(null);

/** いま見ている作業場所を中の部品に渡す（ファイル・変更・履歴のタブ、右の欄のファイル・変更） */
export function WorkplaceProvider({ value, children }: { value: WorkplaceRef; children: ReactNode }) {
  return <WorkplaceContext.Provider value={value}>{children}</WorkplaceContext.Provider>;
}

/** いま見ている作業場所（worktree を渡せばそれ、渡さなければ（undefined なら）WorkplaceProvider の作業場所、なければ本体） */
export function useWorkplace(projectId: number, worktree?: string | null): WorkplaceRef {
  // 既定の引数で hook を呼ばない
  const fromContext = useContext(WorkplaceContext);
  const path = worktree === undefined ? (fromContext?.worktree ?? null) : worktree;
  return { projectId, worktree: path };
}

/**
 * いま見ている作業場所に向けた、Git・ファイル・検索の操作先（useWorkplace の上の、前の形。worktree は undefined = 本体）。
 * key は作業場所が変わったら読み直すための文字（effect の依存や、覚えた結果の見分けに使う）
 */
export function useGitTarget(projectId: number, worktreeArg?: string) {
  const ref = useWorkplace(projectId, worktreeArg);
  const worktree = ref.worktree ?? undefined;
  return { target: { projectId: ref.projectId, worktree } as GitTarget, key: workplaceKey(ref), worktree };
}
