import { useMemo } from "react";
import type { AgentState, Chat } from "@shared/types";
import type { BoardEntry } from "@/features/chatList/boardColumns";
import { archiveMatches, type ArchiveFilter } from "./archiveFilter";

/** 絞り込みの値（useKanbanFilters の一部。matches は名前の検索） */
export interface KanbanFilterValues {
  archive: ArchiveFilter;
  /** "all" はすべて、"" は本体、それ以外はワークツリーのフォルダ */
  worktree: string;
  matches: (chat: Chat) => boolean;
}

/**
 * 絞り込んだチャット（新しく動いた順）。アーカイブ（archiveMatches）・作業場所・名前の検索で絞る
 * （未アーカイブだけのときは、読み込みの時点でもアーカイブ済みを除いている）。projectIds を渡すと、それ以外のプロジェクトのチャットを除く（全プロジェクトのボード: しまったプロジェクトの分を出さない）
 */
export function kanbanEntries(chats: Chat[], filters: KanbanFilterValues, stateOf: (chat: Chat) => AgentState, projectIds?: ReadonlySet<number>): BoardEntry[] {
  const list: BoardEntry[] = [];
  for (const chat of chats) {
    if (projectIds && !projectIds.has(chat.project_id)) continue;
    if (!archiveMatches(chat, filters.archive)) continue;
    if (filters.worktree !== "all" && chat.worktree_path !== filters.worktree) continue;
    if (!filters.matches(chat)) continue;
    list.push({ chat, state: stateOf(chat) });
  }
  return list.sort((a, b) => b.chat.active_at.localeCompare(a.chat.active_at));
}

/** カンバンに出すチャット（絞り込みが変わったときだけ計算し直す。状態の列ごとの分け方は、ボード・段・リストのそれぞれで byColumn） */
export function useKanbanEntries({
  chats,
  filters,
  stateOf,
  projectIds,
}: {
  chats: Chat[];
  filters: KanbanFilterValues;
  stateOf: (chat: Chat) => AgentState;
  /** 全プロジェクトのボードで出すプロジェクト（プロジェクトのボードでは undefined） */
  projectIds?: ReadonlySet<number>;
}) {
  const { archive, worktree, matches } = filters;
  const entries = useMemo(
    () => kanbanEntries(chats, { archive, worktree, matches }, stateOf, projectIds),
    [chats, archive, worktree, matches, stateOf, projectIds],
  );
  return { entries };
}
