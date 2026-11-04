import { MoreHorizontal } from "lucide-react";
import { busyWithUnread } from "@shared/chat/state";
import { AGENT_STATE_LABELS, type AgentState, type Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { cx } from "@/lib/cx";
import { startChatDrag } from "@/features/group/groups";
import type { ChatTitleEditor } from "@/features/chat/useChatRename";
import { href, openChat } from "@/app/router";
import { formatDayTime, shortRelativeTime } from "@/lib/time";
import { workingFor } from "@/features/chat/activity";
import { useTicker } from "@/hooks/useTicker";
import { useChatActivity } from "@/features/chat/chatActivity";
import { useChatSelection } from "./chatSelection";
import { CARD_MENU_WIDTH } from "@/features/chat/ChatMenu";
import { ChatTitleInput } from "@/features/chat/ChatTitleInput";
import { IconButton } from "@/ui/IconButton";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";

/**
 * サイドバーのチャットの行（押すと右のパネルで開く・⌘ / Shift を押しながらで複数選ぶ・ダブルクリックで名前を変える・ドラッグでグループへ移す・
 * 右クリックか、乗せると右端に出る「…」でメニュー（複数選んでいればまとめて操作））
 */
export function ChatRow({
  chat,
  state,
  active,
  menuOpen = false,
  onMenu,
  onCloseMenu,
  onRename,
  rename,
}: {
  chat: Chat;
  state: AgentState;
  active: boolean;
  /** この行のメニューを開いているか（「…」を出したままにし、もう一度押すと閉じる） */
  menuOpen?: boolean;
  onMenu: (at: { x: number; y: number }) => void;
  onCloseMenu?: () => void;
  /** ダブルクリックで名前をその場で変え始める */
  onRename: () => void;
  /** 名前をその場で変えている途中のとき */
  rename?: ChatTitleEditor;
}) {
  // hooks は、下の早い return（名前の変更中）より前に呼ぶ
  const selection = useChatSelection();
  const selected = selection?.has(chat.id) ?? false;
  // 作業中のまま、まだ見ていない返答がある（印に未読の点を重ね、名前を太字に）
  const busyUnread = busyWithUnread(chat, state);
  if (rename) {
    // 押しても開かず、ドラッグもしない（入力欄の文字を選べるように）
    return (
      <li>
        <div className={cx("chat-row", "renaming", active && "active")}>
          <StatusSlot state={state} unread={busyUnread} />
          <span className="chat-row-body">
            <ChatTitleInput chat={chat} editor={rename} />
          </span>
        </div>
      </li>
    );
  }
  // 選んでいるチャットのメニューなら、まとめて操作するメニュー
  const openMenuAt = (at: { x: number; y: number }) => {
    if (selection && selected && selection.ids.size > 1) selection.openMenu(at);
    else onMenu(at);
  };
  return (
    <li className="chat-row-item">
      <a
        className={cx(
          "chat-row",
          chat.archived_at && "archived",
          active && "active",
          selected && "multi-selected",
          (state === "needs_input" || state === "unread" || busyUnread) && "is-unread",
        )}
        data-chat-id={chat.id}
        aria-selected={selection && selection.ids.size > 0 ? selected : undefined}
        href={href({ name: "chat", projectId: chat.project_id, chatId: chat.id })}
        title={`${chatTitle(chat.title)}（${AGENT_STATE_LABELS[state]}${busyUnread ? "・未読あり" : ""}）`}
        draggable
        onDragStart={(e) => startChatDrag(e, chat.id)}
        onDoubleClick={(e) => {
          e.preventDefault();
          onRename();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenuAt({ x: e.clientX, y: e.clientY });
        }}
        onClick={(e) => {
          e.preventDefault();
          // ⌘ を押しながら: 選ぶ・外す / Shift: 前に選んだものからの範囲（どちらも開かない）
          if (selection && (e.metaKey || e.ctrlKey)) return selection.toggle(chat.id);
          if (selection && e.shiftKey) return selection.range(chat.id);
          selection?.clear();
          // 開いているチャットをもう一度押したときも、閉じたパネルを開き直す
          openChat(chat.project_id, chat.id);
        }}
      >
        <StatusSlot state={state} unread={busyUnread} />
        <span className="chat-row-body">
          <span className="chat-row-line">
            <span className="chat-row-title">{chatTitle(chat.title)}</span>
            {state === "running" ? (
              <RunningTime chat={chat} />
            ) : (
              <span className="chat-row-time" title={formatDayTime(chat.active_at)}>
                {shortRelativeTime(chat.active_at)}
              </span>
            )}
          </span>
          <span className="chat-row-meta">
            <WorktreeChip chat={chat} />
          </span>
        </span>
      </a>
      {/* 乗せたとき・メニューを開いている間だけ出す「…」（時刻の上に重ねる）。行の中のリンクと分けて置く */}
      <span className={cx("chat-row-actions", menuOpen && "open")}>
        <IconButton
          icon={MoreHorizontal}
          size={14}
          label="メニュー"
          title="メニュー（右クリックでも開く）"
          className="chat-row-more"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            if (menuOpen) return onCloseMenu?.();
            // メニューの右端を、ボタンの右端にそろえて下に出す
            const rect = e.currentTarget.getBoundingClientRect();
            openMenuAt({ x: rect.right - CARD_MENU_WIDTH, y: rect.bottom + 4 });
          }}
        />
      </span>
    </li>
  );
}

/** 作業中のチャットの時刻の代わりに出す経過時間（「作業中 3分」）。マウスを乗せると、いまの作業（ファイルの編集・コマンドの実行など） */
function RunningTime({ chat }: { chat: Chat }) {
  useTicker(30_000);
  const activity = useChatActivity(chat.id);
  const since = chat.turn_started_at ?? chat.active_at;
  return (
    <span className="chat-row-time running" title={`${activity ?? "作業中"}\n始めた時刻: ${formatDayTime(since)}`}>
      {workingFor(since)}
    </span>
  );
}
