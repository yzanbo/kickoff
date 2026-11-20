import type { CSSProperties, RefObject } from "react";
import { busyWithUnread } from "@shared/chat/state";
import type { Chat } from "@shared/chat/types";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { relativeTime } from "@/foundation/ui/lib/time";
import { useChildChats } from "@/features/chat/ui/store/knownChats";
import { Popover } from "@/foundation/ui/kit/Popover";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { StatusSlot } from "@/features/chat/ui/state/StatusSlot";
import { ChildDepthMark } from "./ChildDepthMark";
import { descendantRows } from "./childChats";
import { openChildSide } from "@/features/chat/ui/open/openChat";

/**
 * タブの子チャットの印（ChildActivityMark）を押して開く、そのチャットの子チャットの一覧（孫・ひ孫も、親の下に続けて字下げ。アーカイブ済みは出さない）。
 * 見るだけの一覧で、アーカイブ・削除などの操作は置かない（入力欄の上の子チャットのピルと分ける）。
 * 行を押すと、設定の開き方によらず、いちばん上の親のチャットを左に、その子チャットを右の欄に開く（openChildSide）
 */
export function TabChildChatsPopover({ chatId, anchor, onClose }: { chatId: number; anchor: RefObject<HTMLElement | null>; onClose: () => void }) {
  const childrenOf = useChildChats();
  const { stateOf } = useChatStates();
  const rows = descendantRows(chatId, childrenOf);
  const open = (chat: Chat) => {
    onClose();
    openChildSide(chat);
  };
  return (
    // タブの名前のボタンの中から開くので、body の直下に出す（タブの文字の大きさ・押したときの動きを受け継がない）
    <Popover anchor={anchor} gap={6} portal title="子チャット" label="子チャットの一覧" className="state-chats-popover tab-child-chats-popover" onClose={onClose}>
      {rows.length === 0 && <p className="state-chats-empty muted">表示中の子チャットはありません</p>}
      {rows.map(({ chat, depth }) => (
        <button
          key={chat.id}
          type="button"
          className="state-chats-row tab-child-chats-row tree-indent"
          style={{ "--depth": depth - 1 } as CSSProperties}
          title={`${chatTitle(chat.title)} を右の欄で開く`}
          onClick={() => open(chat)}
        >
          <StatusSlot state={stateOf(chat)} unread={busyWithUnread(chat, stateOf(chat))} />
          {depth > 1 && <ChildDepthMark chat={chat} />}
          <span className="state-chats-title">{chatTitle(chat.title)}</span>
          <span className="state-chats-time muted">{relativeTime(chat.active_at, { style: "short" })}</span>
        </button>
      ))}
    </Popover>
  );
}
