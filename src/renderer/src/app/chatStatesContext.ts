import { createContext, useContext } from "react";
import type { AgentState, Approval, Chat } from "@shared/types";
import { approvalIndex, chatStateOf, type ApprovalIndex } from "@/features/chat/chatState";

/** 回答待ちの依頼の一覧から 1 回だけ作る、チャットの状態の引き当て（App が依頼の一覧を受け取るたびに作り直す） */
export interface ChatStates {
  /** すべてのプロジェクトの、回答待ちの依頼 */
  approvals: Approval[];
  /** 回答待ちの依頼があるチャットの ID */
  pending: ApprovalIndex;
  /** チャットの状態（回答待ちの依頼があれば回答待ち。chatStateOf と同じ） */
  stateOf: (chat: Chat) => AgentState;
  /** そのチャットの回答待ちの依頼の数（カードの「回答 n件」） */
  pendingCount: (chatId: number) => number;
}

export function indexApprovals(approvals: Approval[]): ChatStates {
  const pending = approvalIndex(approvals);
  const counts = new Map<number, number>();
  for (const a of approvals) counts.set(a.chat_id, (counts.get(a.chat_id) ?? 0) + 1);
  return { approvals, pending, stateOf: (chat) => chatStateOf(chat, pending), pendingCount: (chatId) => counts.get(chatId) ?? 0 };
}

/** App で 1 回入れ、チャットの状態・回答待ちの数が要る部品は approvals を中継せずにここから読む */
export const ChatStatesContext = createContext<ChatStates>(indexApprovals([]));
export const useChatStates = () => useContext(ChatStatesContext);
