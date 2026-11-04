import { useEffect, useMemo } from "react";
import type { Chat } from "@shared/types";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { useShowArchivedChats } from "@/features/chatList/chatListFlags";
import type { PanelScope } from "@/features/panel/surfaces";
import { useChats } from "@/stores/chats";
import { dispatchPanel } from "./panelStore";

/**
 * サイドバーに出ているチャット（パネルのチャットのタブをこれにそろえる）。アーカイブ済みは、サイドバーと共通の
 * 「アーカイブ済みを表示」（kickoff:sidebar-show-archived）を入れているときだけ含める。
 * 全プロジェクトでは、サイドバーと同じく、しまったプロジェクトとタグの絞り込みに合わないプロジェクトのチャットを除く。
 * loaded: 一覧が届いたか（タブをそろえるのは届いてから。届いたあとはサーバーの知らせで直るので、いつも今の一覧）
 */
export function useLinkedChats(scope: PanelScope): { chats: Chat[]; loaded: boolean } {
  const [showArchived] = useShowArchivedChats();
  // 全プロジェクトのときに出すプロジェクト（サイドバーと同じ: しまったものを除き、タグの絞り込みに合うもの）
  const { visible } = useVisibleProjects();
  const list = useChats({ projectId: scope === "all" ? undefined : scope, archived: showArchived });
  const chats = useMemo(() => {
    if (scope !== "all") return list.chats;
    const shown = new Set(visible.map((p) => p.id));
    return list.chats.filter((r) => shown.has(r.project_id));
  }, [scope, list.chats, visible]);
  return { chats, loaded: list.loaded };
}

/**
 * 欄のチャットのタブを、サイドバーの一覧にそろえる（一覧が届いてから。チャットができる・アーカイブして隠す・別のプロジェクトへ移すと、タブも増減する）。
 * サイドバーに出ているチャットを返す（タブのチャットの状態・まとまりの数もこれで数える）
 */
export function useLinkedTabs(key: string, scope: PanelScope): Chat[] {
  const { chats, loaded } = useLinkedChats(scope);
  useEffect(() => {
    if (loaded) dispatchPanel(key, { type: "sync", chats });
  }, [key, chats, loaded]);
  return chats;
}
