import { useState } from "react";
import type { Chat } from "@shared/types";
import { useChatSearch } from "@/features/chat/chatSearch";
import { useSetting } from "@/hooks/useSetting";
import { ALL_PROJECTS_BOARD_LANES, BOARD_ARCHIVE_FILTER, PROJECT_BOARD_LANES } from "@/lib/storageKeys";
import { workplaceOf } from "@/features/worktree/workplace";
import { useWorktreesOf } from "@/stores/worktrees";
import type { BoardLane } from "./BoardLanes";

/** カンバンの絞り込み（アーカイブ（覚えておく）・作業場所・名前の検索） */
export function useKanbanFilters() {
  const [archive, setArchive] = useSetting(BOARD_ARCHIVE_FILTER);
  // 作業場所（ワークツリー）での絞り込み（"all" はすべて、"" は本体）
  const [worktree, setWorktree] = useState("all");
  const [query, setQuery] = useState("");
  const search = useChatSearch(query);
  return { archive, setArchive, worktree, setWorktree, query, setQuery, search };
}

/** 絞り込みの候補: ワークツリーの作業場所（ブランチ名で出し、フォルダが消えたものは「フォルダなし」と添える） */
export function useWorktreeChoices(chats: Chat[]) {
  const worktreeChats = chats.filter((r): r is Chat & { worktree_path: string } => r.worktree_path !== null);
  const worktreesOf = useWorktreesOf(worktreeChats.map((r) => r.project_id));
  return [...new Map(worktreeChats.map((r) => [r.worktree_path, r])).values()]
    .map((r) => {
      const place = workplaceOf(r, worktreesOf(r.project_id));
      return { path: r.worktree_path, label: place.kind === "missing" ? `${place.name}（フォルダなし）` : place.name };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** カンバン（列 = 状態）で選べる段の分け方（ボタンの並び順。全プロジェクトは プロジェクト → 作業場所、プロジェクトのボードは グループ → 作業場所） */
const KANBAN_LANES: BoardLane[] = ["group", "project", "worktree"];

/**
 * スイムレーンの段の分け方。プロジェクトで分けるのは全プロジェクトのボード、グループで分けるのはプロジェクトのボードだけ。
 * 全プロジェクトのボードは別に覚え、初めはプロジェクト（プロジェクト別のカンバン）。プロジェクトのボードは初めは作業場所
 * （そのボードで選べない分け方を覚えていたら、初めの値）
 */
export function useKanbanLanes(allProjects: boolean) {
  const options = KANBAN_LANES.filter((l) => (allProjects ? l !== "group" : l !== "project"));
  const setting = allProjects ? ALL_PROJECTS_BOARD_LANES : PROJECT_BOARD_LANES;
  const [choice, setLanes] = useSetting(setting);
  const lanes: BoardLane = options.includes(choice) ? choice : setting.initial;
  return { lanes, options, setLanes };
}

