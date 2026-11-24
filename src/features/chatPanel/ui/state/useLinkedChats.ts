import { useEffect, useMemo } from "react";
import type { Chat } from "@shared/chat/types";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { storage } from "@/features/chatPanel/ui/storage";
import { parsePanelKey, projectOfPanel, syncPanel, type PanelScope } from "@/features/panel/ui";
import { useVisibleProjects } from "@/features/projects/ui";
import { useChats } from "@/features/chat/ui";

/**
 * サイドバーに出ているチャット（パネルのチャットのタブをこれにそろえる）。アーカイブ済みは、タブの列の
 * 「アーカイブ済みのチャットを表示」（storage.settings.showArchived。サイドバーの設定とは別で、初めは隠す）を入れているときだけ含める。
 * 全プロジェクトでは、サイドバーと同じく、しまったプロジェクトとタグの絞り込みに合わないプロジェクトのチャットを除く。
 * loaded: 一覧が届いたか（タブをそろえるのは届いてから。届いたあとはサーバーの知らせで直るので、いつも今の一覧）。
 * enabled でなければ読まない（チャットを隠している欄。空のまま loaded にもしない）
 */
export function useLinkedChats(scope: PanelScope, enabled = true): { chats: Chat[]; loaded: boolean } {
  const [showArchived] = useSetting(storage.settings.showArchived);
  // 全プロジェクトのときに出すプロジェクト（サイドバーと同じ: しまったものを除き、タグの絞り込みに合うもの）
  const { visible } = useVisibleProjects();
  const list = useChats({ projectId: typeof scope === "number" ? scope : undefined, archived: showArchived, enabled: enabled && (typeof scope === "number" || scope === "all") });
  const chats = useMemo(() => {
    if (scope !== "all") return list.chats;
    const shown = new Set(visible.map((p) => p.id));
    return list.chats.filter((r) => shown.has(r.project_id));
  }, [scope, list.chats, visible]);
  return { chats, loaded: list.loaded };
}

/**
 * 欄のチャットのタブを、サイドバーの一覧にそろえる（一覧が届いてから。チャットができる・アーカイブして隠す・別のプロジェクトへ移すと、タブも増減する）。
 * 欄の決まりの useSync（チャットのパネル）
 */
export function useLinkedTabs(key: string, scope: PanelScope): void {
  const { chats, loaded } = useLinkedChats(scope);
  useEffect(() => {
    if (loaded) syncPanel(key, chats);
  }, [key, chats, loaded]);
}

/**
 * 欄に出すチャット（タブの列のまとまりの数・札の一覧・サイドバーと同じ並び）: チャットのパネルはその範囲のサイドバーのチャット、
 * チャットの別ウィンドウはそのプロジェクトのサイドバーのチャット（読むだけでタブはそろえない）、ほかの欄（右の欄）は読まない
 */
export function usePanelChats(key: string): Chat[] {
  const at = parsePanelKey(key);
  const scope = at?.surface === "kanban" ? at.scope : at?.surface === "cwin" ? (projectOfPanel(key) ?? at.scope) : null;
  return useLinkedChats(scope ?? "all", scope !== null).chats;
}
