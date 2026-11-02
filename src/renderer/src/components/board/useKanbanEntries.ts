import { useMemo } from "react";
import type { AgentState, Phase, Run } from "../../../../core/types";
import { byColumn, type BoardEntry } from "./boardColumns";
import { archiveMatches, type ArchiveFilter } from "./archiveFilter";

/** 絞り込みの値（useKanbanFilters の一部。matches は名前の検索） */
export interface KanbanFilterValues {
  archive: ArchiveFilter;
  section: Phase | "all";
  /** "all" はすべて、"" は本体、それ以外はワークツリーのフォルダ */
  worktree: string;
  matches: (run: Run) => boolean;
}

/**
 * 絞り込んだチャット（新しく動いた順）。アーカイブ（archiveMatches）・作業場所・セクション・名前の検索で絞る
 * （未アーカイブだけのときは、読み込みの時点でもアーカイブ済みを除いている）。projectIds を渡すと、それ以外のプロジェクトのチャットを除く（全プロジェクトのボード: しまったプロジェクトの分を出さない）
 */
export function kanbanEntries(runs: Run[], filters: KanbanFilterValues, stateOf: (run: Run) => AgentState, projectIds?: ReadonlySet<number>): BoardEntry[] {
  const list: BoardEntry[] = [];
  for (const run of runs) {
    if (projectIds && !projectIds.has(run.project_id)) continue;
    if (!archiveMatches(run, filters.archive)) continue;
    if (filters.worktree !== "all" && run.worktree_path !== filters.worktree) continue;
    if (filters.section !== "all" && run.phase !== filters.section) continue;
    if (!filters.matches(run)) continue;
    list.push({ run, state: stateOf(run) });
  }
  return list.sort((a, b) => b.run.updated_at.localeCompare(a.run.updated_at));
}

/** カンバンに出すチャットと、状態の列ごとの分け方（絞り込みが変わったときだけ計算し直す） */
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
  const { archive, section, worktree, matches } = filters;
  const entries = useMemo(
    () => kanbanEntries(runs, { archive, section, worktree, matches }, stateOf, projectIds),
    [runs, archive, section, worktree, matches, stateOf, projectIds],
  );
  const grouped = useMemo(() => byColumn(entries), [entries]);
  return { entries, grouped };
}
