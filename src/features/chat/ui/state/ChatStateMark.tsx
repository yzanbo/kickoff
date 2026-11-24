import { busyWithUnread } from "@shared/chat/state";
import type { Chat } from "@shared/chat/types";
import { useChatStates } from "./chatStates";
import { StatusSlot } from "./StatusSlot";

/** チャットの状態の印（回答待ちの一覧から状態を引き、作業中のまま未読なら緑の点を重ねる。状態と未読の点を組で渡さない） */
export function ChatStateMark({ chat }: { chat: Chat }) {
  const { stateOf } = useChatStates();
  const state = stateOf(chat);
  return <StatusSlot state={state} unread={busyWithUnread(chat, state)} />;
}
