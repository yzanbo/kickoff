import { boardColumnOf } from "@shared/chat/state";
import { useSetting } from "@/hooks/useSetting";
import { chatStateOf, type ApprovalIndex } from "@/features/chat/chatState";
import { SIDEBAR_COMPACT, SIDEBAR_PROJECT_COMPACT, SIDEBAR_SHOW_ARCHIVED } from "@/lib/storageKeys";
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

/** 要対応のチャット（アーカイブしたものは除く）。pending は ChatStatesContext の回答待ちの一覧 */
export const waitingChats = (chats: Chat[], pending: ApprovalIndex) => chats.filter((r) => !r.archived_at && isWaitingState(chatStateOf(r, pending)));
