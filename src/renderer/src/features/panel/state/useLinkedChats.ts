import { useEffect, useMemo } from "react";
import type { Chat } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { PANEL_SHOW_ARCHIVED } from "@/lib/storageKeys";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import type { PanelScope } from "@/features/panel/surfaces";
import { useChats } from "@/stores/chats";
import { dispatchPanel } from "./panelStore";

/**
 * サイドバーに出ているチャット（パネルのチャットのタブをこれにそろえる）。アーカイブ済みは、タブの列の
 * 「アーカイブ済みのチャットを表示」（PANEL_SHOW_ARCHIVED。サイドバーの設定とは別で、初めは隠す）を入れているときだけ含める。
 * 全プロジェクトでは、サイドバーと同じく、しまったプロジェクトとタグの絞り込みに合わないプロジェクトのチャットを除く。
 * loaded: 一覧が届いたか（タブをそろえるのは届いてから。届いたあとはサーバーの知らせで直るので、いつも今の一覧）。
 * enabled でなければ読まない（チャットを隠している欄。空のまま loaded にもしない）
 */
export function useLinkedChats(scope: PanelScope, enabled = true): { chats: Chat[]; loaded: boolean } {
  const [showArchived] = useSetting(PANEL_SHOW_ARCHIVED);
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
 * サイドバーに出ているチャットを返す（タブのチャットの状態・まとまりの数もこれで数える）。
 * チャットを隠している欄（enabled でない）では、読まず・そろえない（隠したチャットのタブは閉じずにそのまま残し、表示に戻したらそろえる）
 */
export function useLinkedTabs(key: string, scope: PanelScope, enabled: boolean): Chat[] {
  const { chats, loaded } = useLinkedChats(scope, enabled);
  useEffect(() => {
    if (loaded) dispatchPanel(key, { type: "sync", chats });
  }, [key, chats, loaded]);
  return chats;
}
