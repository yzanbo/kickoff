import { boardColumnOf } from "@shared/chat/state";
import { useSetting } from "@/hooks/useSetting";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { storedIds, writeSetting } from "@/lib/storage";
import { chatStateOf, type ApprovalIndex } from "@/features/chat/chatState";
import { SIDEBAR_COMPACT, SIDEBAR_PROJECT_COMPACT, SIDEBAR_SHOW_ARCHIVED, sidebarSectionClosed } from "@/lib/storageKeys";
import type { AgentState, Chat } from "@shared/types";

/** チャットを 1 行で出すか（初めは 1 行） */
export const useCompactRows = () => useSetting(SIDEBAR_COMPACT);
/** プロジェクトのカードを 1 行で出すか（初めは 2 行。チャットの行とは別に切り替える） */
export const useCompactProjects = () => useSetting(SIDEBAR_PROJECT_COMPACT);
/** アーカイブ済みのチャットを出すか（初めは出す） */
export const useShowArchivedChats = () => useSetting(SIDEBAR_SHOW_ARCHIVED);

/** 自分が見る番か（カンバンの回答待ち・未読の列と同じ） */
export const isWaitingState = (state: AgentState) => {
  const column = boardColumnOf(state);
  return column === "needs_input" || column === "unread";
};

/** 自分待ちのチャット（アーカイブしたものは除く）。pending は ChatStatesContext の回答待ちの一覧 */
export const waitingChats = (chats: Chat[], pending: ApprovalIndex) => chats.filter((r) => !r.archived_at && isWaitingState(chatStateOf(r, pending)));

const FOLD_ALL_EVENT = "kickoff:sidebar-fold-all";

/**
 * 見出しの行の「すべて閉じる / 開く」: プロジェクトだけでなく、中のまとまり（グループ・グループなし・固定・アーカイブ済み・並べ方のまとまり）もすべて開閉する。
 * 描かれている部品には知らせ（useFoldAll）で伝え、開くときは、描かれていないまとまり（閉じたプロジェクトの中など）の覚えている値も開いたにする
 */
export function foldAll(collapsed: boolean) {
  if (!collapsed) for (const id of storedIds(sidebarSectionClosed)) writeSetting(sidebarSectionClosed(id), false);
  window.dispatchEvent(new CustomEvent<boolean>(FOLD_ALL_EVENT, { detail: collapsed }));
}

/** 「すべて閉じる / 開く」を受け取る（collapsed: 閉じるなら true） */
export function useFoldAll(handler: (collapsed: boolean) => void) {
  useWindowEvent(FOLD_ALL_EVENT, (e) => handler((e as CustomEvent<boolean>).detail));
}
