import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { archiveMatches, type ArchiveFilter } from "./archiveFilter";

/** 絞り込みの値（useKanbanFilters の一部。matches は名前の検索） */
export interface KanbanFilterValues {
  archive: ArchiveFilter;
  /** "all" はすべて、"" は本体、それ以外はワークツリーのフォルダ */
  worktree: string;
  matches: (chat: Chat) => boolean;
}

/**
 * カンバンに出すチャット（並びは渡したまま。列・段への分け方と並びは bucketChats）。アーカイブ（archiveMatches）・作業場所・名前の検索で絞る
 * （未アーカイブだけのときは、読み込みの時点でもアーカイブ済みを除いている）。projectIds を渡すと、それ以外のプロジェクトのチャットを除く（全プロジェクトのボード: しまったプロジェクトの分を出さない）
 */
export function kanbanChats(chats: readonly Chat[], filters: KanbanFilterValues, projectIds?: ReadonlySet<number>): Chat[] {
  return chats.filter(
    (chat) =>
      (!projectIds || projectIds.has(chat.project_id)) &&
      archiveMatches(chat, filters.archive) &&
      // 作業場所の絞り込みの値は、本体が "" （選択欄の値）
      (filters.worktree === "all" || (chat.worktree_path ?? "") === filters.worktree) &&
      filters.matches(chat),
  );
}

/** カンバンに出すチャット（絞り込みが変わったときだけ計算し直す） */
export function useKanbanChats({
  chats,
  filters,
  projectIds,
}: {
  chats: Chat[];
  filters: KanbanFilterValues;
  /** 全プロジェクトのボードで出すプロジェクト（プロジェクトのボードでは undefined） */
  projectIds?: ReadonlySet<number>;
}) {
  const { archive, worktree, matches } = filters;
  return useMemo(() => kanbanChats(chats, { archive, worktree, matches }, projectIds), [chats, archive, worktree, matches, projectIds]);
}
