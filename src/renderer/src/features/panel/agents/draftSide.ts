import { createContext, useContext } from "react";
import { draftScope, panelKey, type DraftScope } from "@/features/panel/surfaces";
import { movePanel } from "@/features/panel/state/panelStore";

/**
 * 送る前の新しいチャット（下書きのタブ）の右の欄（利用者の依頼。前は送る前のチャットには右の欄がなく、入力欄の上のメモのピルから開くと、
 * メモのタブへ移っていた）。NewChatPane が AgentSplit で包み、中身（メモのピルなど）はこの context で、開く先の右の欄の範囲を知る
 */
export const DraftSideContext = createContext<DraftScope | null>(null);

/** いまの画面が送る前の新しいチャットなら、その右の欄の範囲（ほかは null） */
export const useDraftSide = (): DraftScope | null => useContext(DraftSideContext);

/**
 * 送ってチャットができたら、下書きの右の欄の中身（開いたメモなど）を、そのチャットの右の欄へ移す（同じ中身のまま続けられるように）。
 * チャットなしで開いたメモのタブは、できたチャットのもの（「チャットに入れる」の行き先）にする
 */
export function moveDraftSidePanel(tabKey: string, chatId: number): void {
  movePanel(panelKey("agents", draftScope(tabKey)), panelKey("agents", chatId), (tab) => (tab.kind === "memo" && tab.chatId === null ? { ...tab, chatId } : tab));
}
