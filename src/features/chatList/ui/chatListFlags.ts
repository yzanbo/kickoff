import { boardColumnOf } from "@shared/chat/state";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { chatStateOf, type ApprovalIndex } from "@/features/chat/ui/state/chatState";
import { storage } from "./storage";
import type { AgentState, Chat } from "@shared/chat/types";

/** チャットを 1 行で出すか（初めは 1 行） */
export const useCompactRows = () => useSetting(storage.settings.compact);
/** プロジェクトのカードを 1 行で出すか（初めは 2 行。チャットの行とは別に切り替える） */
export const useCompactProjects = () => useSetting(storage.settings.projectCompact);
/** アーカイブ済みのチャットを出すか（初めは出さない） */
export const useShowArchivedChats = () => useSetting(storage.settings.showArchived);

/** 自分が見る番か（カンバンの回答待ち・未読の列と同じ） */
export const isWaitingState = (state: AgentState) => {
  const column = boardColumnOf(state);
  return column === "needs_input" || column === "unread";
};

/** 要対応のチャット（アーカイブしたものは除く）。pending は ChatStatesContext の回答待ちの一覧 */
export const waitingChats = (chats: Chat[], pending: ApprovalIndex) => chats.filter((r) => !r.archived_at && isWaitingState(chatStateOf(r, pending)));
