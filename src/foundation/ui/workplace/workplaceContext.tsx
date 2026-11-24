import { createContext, useContext, type ReactNode } from "react";
import type { WorkplaceRef } from "./workplace";

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
