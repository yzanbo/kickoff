import { MessagesSquare } from "lucide-react";
import type { AgentState, Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { useChildChats } from "@/stores/chats";
import { chatTitle } from "@/features/chat/chatTitle";
import { usePopover } from "@/ui/Popover";
import { ComposerChip } from "@/features/chat/composer/ComposerChip";
import { openChildChat } from "./childChats";

/** 子チャットの様子の文（札に添える。作業中・回答待ち・答えあり（未読）・失敗・見た） */
const CHILD_STATE_LABELS: Record<AgentState, string> = {
  running: "作業中…",
  needs_input: "回答待ち",
  failed: "失敗",
  unread: "答えあり",
  read: "既読",
};

/** 子チャットの札 1 つ（押すと別ウィンドウで開く） */
function ChildChip({ chat }: { chat: Chat }) {
  const { stateOf } = useChatStates();
  const state = stateOf(chat);
  return (
    <button type="button" className={cx("child-chat-chip", `child-${state}`)} title={`子チャット「${chatTitle(chat.title)}」を開く`} onClick={() => openChildChat(chat)}>
      <MessagesSquare size={12} aria-hidden />
      <span className="child-chat-chip-title">{chatTitle(chat.title)}</span>
      <span className="child-chat-chip-state">
        {state === "running" && <span className="spinner" aria-hidden />}
        {CHILD_STATE_LABELS[state]}
      </span>
    </button>
  );
}

/** 親の会話の、聞いた発言・返答の下に並べる子チャットの札（そこから聞いた子チャットだけ） */
export function ChildChatMarks({ chatId, eventId }: { chatId: number; eventId: number }) {
  const children = useChildChats().get(chatId)?.filter((c) => c.parent_event_id === eventId);
  if (!children?.length) return null;
  return (
    <div className="child-chat-marks">
      {children.map((c) => (
        <ChildChip key={c.id} chat={c} />
      ))}
    </div>
  );
}

/**
 * 入力欄の上の「子チャット 2 · 1 件答えあり」（指示の履歴・サブエージェントと同じピルの列）。押すと子チャットの一覧を開き、行を押すと別ウィンドウで開く。
 * 会話を遡らなくても、答えが来たこととどこにあるかが分かる（自分待ちの子があればピルに点）
 */
export function ChildChatsChip({ chatId }: { chatId: number }) {
  const children = useChildChats().get(chatId);
  const { stateOf } = useChatStates();
  const popover = usePopover();
  if (!children?.length) return null;
  const waiting = children.filter((c) => ["needs_input", "unread", "failed"].includes(stateOf(c))).length;
  return (
    <ComposerChip
      popover={popover}
      chip={
        <>
          <MessagesSquare size={14} className="chip-icon" aria-hidden />
          子チャット {children.length}
          {waiting > 0 && <span className="child-chats-waiting"> · {waiting} 件答えあり</span>}
        </>
      }
      title="このチャットから聞いた子チャット（行を押すと別ウィンドウで開く）"
      label="子チャット"
      className="child-chats-popover"
    >
      {children.map((c) => (
        <ChildChip key={c.id} chat={c} />
      ))}
    </ComposerChip>
  );
}
