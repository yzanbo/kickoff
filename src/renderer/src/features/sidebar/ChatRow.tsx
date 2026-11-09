import { Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { busyWithUnread } from "@shared/chat/state";
import { AGENT_STATE_LABELS, type AgentState, type Chat } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { cx } from "@/lib/cx";
import { isOpenKey, isRenameKey } from "@/lib/keys";
import { anchorPlacement, type Placement } from "@/lib/floating";
import { startChatDrag } from "@/features/group/groups";
import type { ChatTitleEditor } from "@/features/chat/useChatRename";
import { href, openChat } from "@/app/router";
import { formatDayTime, shortRelativeTime } from "@/lib/time";
import { workingFor } from "@/features/chat/activity";
import { useTicker } from "@/hooks/useTicker";
import { useChatActivity } from "@/features/chat/chatActivity";
import { useChatSelection } from "./chatSelection";
import { ChatTitleInput } from "@/features/chat/ChatTitleInput";
import { IconButton } from "@/ui/IconButton";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { WorktreeChip } from "@/features/worktree/WorktreeChip";
import { GroupChip } from "@/features/group/GroupChip";
import { ProjectMark } from "@/features/project/ProjectMark";
import type { RowReorderProps } from "./useChatRowReorder";

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
  project,
  after,
  onOpen,
  reorder,
}: {
  chat: Chat;
  state: AgentState;
  active: boolean;
  /** この行のメニューを開いているか（「…」を出したままにし、もう一度押すと閉じる） */
  menuOpen?: boolean;
  onMenu: (at: Placement) => void;
  onCloseMenu?: () => void;
  /** ダブルクリックで名前をその場で変え始める */
  onRename: () => void;
  /** 名前をその場で変えている途中のとき */
  rename?: ChatTitleEditor;
  /** プロジェクトをまたぐ一覧（要対応のまとまり）では、どのプロジェクトのチャットかを印で添える */
  project?: { id: number; name: string };
  /** 行の下に添えるもの（子チャットの開閉。ChildChatRows） */
  after?: ReactNode;
  /** 押したときの開き方（省けばプロジェクトのチャットのパネルで開く。子チャットは別ウィンドウ） */
  onOpen?: () => void;
  /** ドラッグでの手動の並べ替えの落とし先（入る位置の線のクラスと、行に付ける dragover / drop。useChatRowReorder） */
  reorder?: RowReorderProps;
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
  // 開く（開いているチャットをもう一度押したときも、閉じたパネルを開き直す）
  const open = () => (onOpen ? onOpen() : openChat(chat.project_id, chat.id));
  // 選んでいるチャットのメニューなら、まとめて操作するメニュー
  const openMenuAt = (at: Placement) => {
    if (selection && selected && selection.ids.size > 1) selection.openMenu(at);
    else onMenu(at);
  };
  return (
    <li className={cx("chat-row-item", reorder?.className)} {...reorder?.handlers}>
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
        title={`${chatTitle(chat.title)}（${project ? `${project.name}・` : ""}${AGENT_STATE_LABELS[state]}${busyUnread ? "・未読あり" : ""}）`}
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
          // ⌘ を押しながら: 選ぶ・外す / Shift: 前に選んだものからの範囲を足す（どちらも開かない）。ふつうのクリックは選ぶのをやめて開く
          if (selection?.click(e, chat.id)) return;
          open();
        }}
        // 行にピントがあるときの Enter は名前の変更（Finder と同じ。利用者の依頼で、前は Enter で開いていた）、Space で開く
        onKeyDown={(e) => {
          if (isRenameKey(e)) {
            e.preventDefault();
            onRename();
          } else if (isOpenKey(e)) {
            e.preventDefault();
            open();
          }
        }}
      >
        <StatusSlot state={state} unread={busyUnread} />
        <span className="chat-row-body">
          <span className="chat-row-line">
            {project && <ProjectMark project={project} className="chat-row-project" />}
            <span className="chat-row-title">{chatTitle(chat.title)}</span>
            {state === "running" ? (
              <RunningTime chat={chat} />
            ) : (
              <span className="chat-row-time" title={formatDayTime(chat.active_at)}>
                {shortRelativeTime(chat.active_at)}
              </span>
            )}
          </span>
          {/* 2 行目: グループと作業場所（ブランチ）（1 行で出すときは隠す） */}
          <span className="chat-row-meta">
            <GroupChip chat={chat} />
            <WorktreeChip chat={chat} />
          </span>
        </span>
      </a>
      {/* 乗せたとき・メニューを開いている間だけ出す「…」（時刻の上に重ねる）。行の中のリンクと分けて置く */}
      <span className={cx("chat-row-actions", menuOpen && "open")}>
        <IconButton
          icon={Ellipsis}
          size={14}
          label="メニュー"
          title="メニュー（右クリックでも開く）"
          className="chat-row-more"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => {
            if (menuOpen) return onCloseMenu?.();
            // メニューの右端を、ボタンの右端にそろえて下に出す
            openMenuAt(anchorPlacement(e.currentTarget, { align: "end" }));
          }}
        />
      </span>
      {after}
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
