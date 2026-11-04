import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { useProjectTagFilter } from "@/features/project/projectTagFilter";
import { useProjects } from "@/app/projectsContext";
import { useBoardChats } from "@/features/board/useBoardChats";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";

/** パネルがサイドバーと連動する範囲（プロジェクト・全プロジェクト。null なら連動しない） */
export type LinkScope = number | "all" | null;

const NO_CHATS: Chat[] = [];
const ignore = () => {};

/**
 * サイドバーに出ているチャット（パネルのチャットのタブをこれにそろえる）。アーカイブ済みは、サイドバーと共通の
 * 「アーカイブ済みを表示」（kickoff:sidebar-show-archived）を入れているときだけ含める。
 * 全プロジェクトでは、サイドバーと同じく、しまったプロジェクトとタグの絞り込みに合わないプロジェクトのチャットを除く。
 * fresh: このパネルを開いてから読み直したか（覚えている内容は古いことがあるので、そろえるのは読み直してから）
 */
export function useLinkedChats(scope: LinkScope): { chats: Chat[]; fresh: boolean; showArchived: boolean } {
  const [showArchived] = useShowArchivedChats();
  const { projectsById } = useProjects();
  const tagFilter = useProjectTagFilter();
  const board = useBoardChats(scope === "all" ? undefined : scope, showArchived, ignore);
  const chats = useMemo(() => {
    if (scope === null) return NO_CHATS;
    if (scope !== "all") return board.chats;
    return board.chats.filter((r) => {
      const p = projectsById.get(r.project_id);
      return p !== undefined && !p.archived_at && tagFilter.matches(p);
    });
  }, [scope, board.chats, projectsById, tagFilter]);
  return { chats, fresh: scope !== null && board.fresh, showArchived };
}
