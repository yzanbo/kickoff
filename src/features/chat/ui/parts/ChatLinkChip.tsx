import "./ChatLinkChip.css";
import { MessagesSquare } from "lucide-react";
import { STATE_LOOKS } from "@shared/chat/stateLooks";
import type { Chat } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { openChat } from "@/features/chat/ui/open/openChat";
import { ChatStateMark } from "@/features/chat/ui/state/ChatStateMark";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { useChildChats, useKnownChat } from "@/features/chat/ui/store/knownChats";

/**
 * チャットの札 1 つ（状態の印と名前。押すと開く: 子・兄弟チャットは設定の開き方（右の欄 / 別ウィンドウ）、親のないチャットはチャットのパネル。openChat）
 */
function ChatLinkChip({ chat }: { chat: Chat }) {
  const { stateOf } = useChatStates();
  const state = stateOf(chat);
  const kind = chat.parent_chat_id === null ? "チャット" : "子チャット";
  return (
    <button type="button" className={cx("child-chat-chip pill", `child-${state}`)} title={`${kind}「${chatTitle(chat.title)}」を開く`} onClick={() => openChat(chat)}>
      <MessagesSquare size={12} aria-hidden />
      <span className="child-chat-chip-title">{chatTitle(chat.title)}</span>
      <span className="child-chat-chip-state">
        {/* 状態の印はサイドバーの行・タブと同じ（作業中のリング・回答待ちの！・未読と失敗の点） */}
        <ChatStateMark chat={chat} />
        {STATE_LOOKS[state].label}
      </span>
    </button>
  );
}

/** ID で引いた札（一覧にまだ届いていない・消されたチャットは出さない） */
function ChatLinkChipOf({ id }: { id: number }) {
  const chat = useKnownChat(id);
  return chat ? <ChatLinkChip chat={chat} /> : null;
}

/**
 * 親の会話の、聞いた発言・返答の下に並べる子チャットの札（そこから聞いた子チャットだけ）と、その発言の作業で AI が create_chat で作った
 * 兄弟チャット・親のないチャットの札（created。作った側の流れから見つけられるように）
 */
export function CreatedChatMarks({ chatId, eventId, created }: { chatId: number; eventId: number; created?: readonly number[] }) {
  const children = useChildChats().get(chatId)?.filter((c) => c.parent_event_id === eventId) ?? [];
  const others = created?.filter((id) => !children.some((c) => c.id === id)) ?? [];
  if (children.length === 0 && others.length === 0) return null;
  return (
    <div className="child-chat-marks">
      {children.map((c) => (
        <ChatLinkChip key={c.id} chat={c} />
      ))}
      {others.map((id) => (
        <ChatLinkChipOf key={id} id={id} />
      ))}
    </div>
  );
}
