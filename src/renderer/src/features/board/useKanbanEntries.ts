import { useMemo } from "react";
import type { AgentState, Run } from "@shared/types";
import type { BoardEntry } from "@/features/chatList/boardColumns";
import { archiveMatches, type ArchiveFilter } from "./archiveFilter";

/** 絞り込みの値（useKanbanFilters の一部。matches は名前の検索） */
export interface KanbanFilterValues {
  archive: ArchiveFilter;
  /** "all" はすべて、"" は本体、それ以外はワークツリーのフォルダ */
  worktree: string;
  matches: (run: Run) => boolean;
}

/**
 * 絞り込んだチャット（新しく動いた順）。アーカイブ（archiveMatches）・作業場所・名前の検索で絞る
 * （未アーカイブだけのときは、読み込みの時点でもアーカイブ済みを除いている）。projectIds を渡すと、それ以外のプロジェクトのチャットを除く（全プロジェクトのボード: しまったプロジェクトの分を出さない）
 */
export function kanbanEntries(runs: Run[], filters: KanbanFilterValues, stateOf: (run: Run) => AgentState, projectIds?: ReadonlySet<number>): BoardEntry[] {
  const list: BoardEntry[] = [];
  for (const run of runs) {
    if (projectIds && !projectIds.has(run.project_id)) continue;
    if (!archiveMatches(run, filters.archive)) continue;
    if (filters.worktree !== "all" && run.worktree_path !== filters.worktree) continue;
    if (!filters.matches(run)) continue;
    list.push({ run, state: stateOf(run) });
  }
  return list.sort((a, b) => b.run.active_at.localeCompare(a.run.active_at));
}

/** カンバンに出すチャット（絞り込みが変わったときだけ計算し直す。状態の列ごとの分け方は、ボード・段・リストのそれぞれで byColumn） */
export function useKanbanEntries({
  runs,
  filters,
  stateOf,
  projectIds,
}: {
  runs: Run[];
  filters: KanbanFilterValues;
  stateOf: (run: Run) => AgentState;
  /** 全プロジェクトのボードで出すプロジェクト（プロジェクトのボードでは undefined） */
  projectIds?: ReadonlySet<number>;
}) {
  const { archive, worktree, matches } = filters;
  const entries = useMemo(
    () => kanbanEntries(runs, { archive, worktree, matches }, stateOf, projectIds),
    [runs, archive, worktree, matches, stateOf, projectIds],
  );
  return { entries };
}
