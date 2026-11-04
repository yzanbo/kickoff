import { useMemo } from "react";
import type { Chat } from "@shared/types";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
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
  // 全プロジェクトのときに出すプロジェクト（サイドバーと同じ: しまったものを除き、タグの絞り込みに合うもの）
  const { visible } = useVisibleProjects();
  const list = useChats({ projectId: scope === "all" || scope === null ? undefined : scope, archived: showArchived, enabled: scope !== null });
  const chats = useMemo(() => {
    if (scope === null) return NO_CHATS;
    if (scope !== "all") return list.chats;
    const shown = new Set(visible.map((p) => p.id));
    return list.chats.filter((r) => shown.has(r.project_id));
  }, [scope, list.chats, visible]);
  return { chats, loaded: list.loaded, showArchived };
}
