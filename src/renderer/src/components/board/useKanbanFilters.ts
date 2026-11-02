import { useState } from "react";
import type { Phase, Run } from "../../../../core/types";
import { useChatSearch } from "../../chatSearch";
import { useStoredChoice } from "../../hooks/useStoredState";
import { BOARD_LANES_ALL_KEY, BOARD_LANES_KEY, BOARD_SHOW_ARCHIVED_KEY } from "../../storageKeys";
import { workplaceOf } from "../../worktree/workplace";
import { useWorktreeLists } from "../../worktree/worktreeBranches";
import { BOARD_LANES, type BoardLane } from "./BoardLanes";
import { useArchiveFilter } from "./archiveFilter";

/** カンバンの絞り込み（アーカイブ（覚えておく）・セクション・作業場所・名前の検索） */
export function useKanbanFilters() {
  const [archive, setArchive] = useArchiveFilter(BOARD_SHOW_ARCHIVED_KEY);
  const [section, setSection] = useState<Phase | "all">("all");
  // 作業場所（ワークツリー）での絞り込み（"all" はすべて、"" は本体）
  const [worktree, setWorktree] = useState("all");
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  return { archive, setArchive, section, setSection, worktree, setWorktree, query, setQuery, search };
}

/** 絞り込みの候補: ワークツリーの作業場所（ブランチ名で出し、フォルダが消えたものは「フォルダなし」と添える） */
export function useWorktreeChoices(runs: Run[]) {
  const worktreeRuns = runs.filter((r) => r.worktree_path);
  const worktreesOf = useWorktreeLists(worktreeRuns.map((r) => r.project_id));
  return [...new Map(worktreeRuns.map((r) => [r.worktree_path, r])).values()]
    .map((r) => {
      const place = workplaceOf(r, worktreesOf(r.project_id));
      return { path: r.worktree_path, label: place.kind === "missing" ? `${place.name}（フォルダなし）` : place.name };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** カンバン（列 = 状態）で選べる段の分け方 */
const KANBAN_LANES: BoardLane[] = ["worktree", "phase", "group", "project"];

/**
 * スイムレーンの段の分け方。プロジェクトで分けるのは全プロジェクトのボード、グループで分けるのはプロジェクトのボードだけ。
 * 全プロジェクトのボードは別に覚え、初めはプロジェクト（プロジェクト別のカンバン）。プロジェクトのボードは初めはセクション
 */
export function useKanbanLanes(allProjects: boolean) {
  const options = KANBAN_LANES.filter((l) => (allProjects ? l !== "group" : l !== "project"));
  const fallback: BoardLane = allProjects ? "project" : "phase";
  const [choice, setLanes] = useStoredChoice<BoardLane>(allProjects ? BOARD_LANES_ALL_KEY : BOARD_LANES_KEY, BOARD_LANES, fallback);
  const lanes: BoardLane = options.includes(choice) ? choice : fallback;
  return { lanes, options, setLanes };
}
