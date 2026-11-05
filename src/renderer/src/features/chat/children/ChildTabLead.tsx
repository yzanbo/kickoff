import { MessagesSquare } from "lucide-react";
import { useChatStates } from "@/app/chatStatesContext";
import { useKnownChat } from "@/stores/chats";
import { StatusSlot } from "@/features/chat/StatusSlot";

/** 右の欄の子チャットのタブの名前の前に置く、子チャットの状態の印（サイドバーの行・チャットのタブと同じ。分からなければふつうのアイコン） */
export function ChildTabLead({ tab }: { tab: { childId: number } }) {
  const chat = useKnownChat(tab.childId);
  const { stateOf } = useChatStates();
  if (!chat) return <MessagesSquare size={12} className="muted" aria-hidden />;
  return <StatusSlot state={stateOf(chat)} />;
}
