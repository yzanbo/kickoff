import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { useProjectTagFilter } from "@/features/project/projectTagFilter";
import { useProjects } from "@/app/projectsContext";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { NO_CHATS, useChats } from "@/stores/chats";

/** パネルがサイドバーと連動する範囲（プロジェクト・全プロジェクト。null なら連動しない） */
export type LinkScope = number | "all" | null;

/**
 * サイドバーに出ているチャット（パネルのチャットのタブをこれにそろえる）。アーカイブ済みは、サイドバーと共通の
 * 「アーカイブ済みを表示」（kickoff:sidebar-show-archived）を入れているときだけ含める。
 * 全プロジェクトでは、サイドバーと同じく、しまったプロジェクトとタグの絞り込みに合わないプロジェクトのチャットを除く。
 * loaded: 一覧が届いたか（タブをそろえるのは届いてから。届いたあとはサーバーの知らせで直るので、いつも今の一覧）
 */
export function useLinkedChats(scope: LinkScope): { chats: Chat[]; loaded: boolean; showArchived: boolean } {
  const [showArchived] = useShowArchivedChats();
  const { projectsById } = useProjects();
  const tagFilter = useProjectTagFilter();
  const list = useChats({ projectId: scope === "all" || scope === null ? undefined : scope, archived: showArchived, enabled: scope !== null });
  const chats = useMemo(() => {
    if (scope === null) return NO_CHATS;
    if (scope !== "all") return list.chats;
    return list.chats.filter((r) => {
      const p = projectsById.get(r.project_id);
      return p !== undefined && !p.archived_at && tagFilter.matches(p);
    });
  }, [scope, list.chats, projectsById, tagFilter]);
  return { chats, loaded: list.loaded, showArchived };
}
