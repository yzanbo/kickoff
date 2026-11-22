import { createContext, useContext } from "react";
import { draftScope, kindOf, movePanel, takePanels, type DraftScope } from "@/features/panel/ui";
import { chatSidePanel } from "@/features/chat/ui";

/**
 * 送る前の新しいチャット（下書きのタブ）の右の欄（入力欄の上のノートのピルから開いても、
 * ノートのタブへ移らないように）。NewChatPane が AgentSplit で包み、中身（ノートのピルなど）はこの context で、開く先の右の欄の範囲を知る
 */
export const DraftSideContext = createContext<DraftScope | null>(null);

/** いまの画面が送る前の新しいチャットなら、その右の欄の範囲（ほかは null） */
export const useDraftSide = (): DraftScope | null => useContext(DraftSideContext);

/**
 * 送ってチャットができたら、下書きの右の欄の中身（開いたノートなど）を、そのチャットの右の欄へ移す（同じ中身のまま続けられるように）。
 * チャットなしで開いたノートのタブは、できたチャットのもの（「チャットに入れる」の行き先）にする
 */
export function moveDraftSidePanel(tabKey: string, chatId: number): void {
  movePanel(chatSidePanel(draftScope(tabKey)), chatSidePanel(chatId), (tab) => (tab.kind === "note" && tab.chatId === null ? { ...tab, chatId } : tab));
}

/** 送らずに閉じた下書きの右の欄を捨てる（中のタブの後始末もする。送ったときは、先にできたチャットの右の欄へ移してある） */
export function discardDraftSidePanel(tabKey: string): void {
  const side = chatSidePanel(draftScope(tabKey));
  for (const [, state] of takePanels((key) => key === side)) state.tabs.forEach((t) => kindOf(t).dispose?.(t));
}
