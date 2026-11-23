import "./ChatRow.css";
import { Ellipsis } from "lucide-react";
import { STATE_LOOKS } from "@shared/chat/stateLooks";
import type { ReactNode } from "react";
import { busyWithUnread, showsBold } from "@shared/chat/state";
import type { AgentState, Chat } from "@shared/chat/types";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { cx } from "@/foundation/ui/lib/cx";
import { anchorPlacement, type Placement } from "@/foundation/ui/lib/floating";
import { startChatDrag } from "@/features/chatList/ui";
import type { ChatTitleEditor } from "@/features/chat/ui/useChatRename";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { href } from "@/foundation/ui/navigation/router";
import { ChatRowFace, ChatRowTime, chatItemProps, useChatSelection } from "@/features/chatList/ui";
import { ChatTitleInput } from "@/features/chat/ui/ChatTitleInput";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { StatusSlot } from "@/features/chat/ui/state/StatusSlot";
import { WorktreeChip } from "@/foundation/ui/workplace/WorktreeChip";
import { GroupChip } from "@/features/groups/ui/GroupChip";
import { ProjectMark } from "@/features/projects/ui/ProjectMark";
import { ChildDepthMark } from "@/features/childChats/ui/ChildDepthMark";
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
  hideChip,
  childMark = false,
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
  /** ドラッグでの手動の並べ替えの落とし先（入る位置の線の属性と、行に付ける dragover / drop。useChatRowReorder） */
  reorder?: RowReorderProps;
  /** 2 行目で隠す札（グループ別・作業場所別のまとまりの中では、見出しと同じことを言う札を出さない） */
  hideChip?: "group" | "worktree";
  /** 子チャットなら名前の前に深さの札（「子」「孫」）を付けるか（親の行の外に 1 行で並ぶとき。状態・要対応で絞った一覧・要対応のまとまり） */
  childMark?: boolean;
}) {
  // hooks は、下の早い return（名前の変更中）より前に呼ぶ
  const selection = useChatSelection();
  const selected = selection?.has(chat.id) ?? false;
  // 作業中のまま、まだ見ていない返答がある（印に未読の点を重ね、名前を太字に）
  const busyUnread = busyWithUnread(chat, state);
  const pinned = chat.pinned && !chat.archived_at;
  const mark = <StatusSlot state={state} unread={busyUnread} />;
  if (rename) {
    // 押しても開かず、ドラッグもしない（入力欄の文字を選べるように）
    return (
      <li className="chat-row-item">
        <div className={cx("chat-row", "renaming", pinned && "pinned", active && "active")}>
          <ChatRowFace mark={mark} editor={<ChatTitleInput chat={chat} editor={rename} />} />
        </div>
      </li>
    );
  }
  // 開く（開いているチャットをもう一度押したときも、閉じたパネルを開き直す）
  const open = () => (onOpen ? onOpen() : openTarget({ kind: "chat", projectId: chat.project_id, chatId: chat.id }));
  // 選んでいるチャットのメニューなら、まとめて操作するメニュー
  const openMenuAt = (at: Placement) => {
    if (selection && selected && selection.ids.size > 1) selection.openMenu(at);
    else onMenu(at);
  };
  return (
    <li className="chat-row-item" {...reorder?.attrs} {...reorder?.handlers}>
      <a
        className={cx(
          "chat-row",
          pinned && "pinned",
          chat.archived_at && "archived",
          active && "active",
          selected && "multi-selected",
          showsBold(state, busyUnread) && "is-unread",
        )}
        aria-selected={selection && selection.ids.size > 0 ? selected : undefined}
        href={href({ name: "chat", projectId: chat.project_id, chatId: chat.id })}
        title={`${chatTitle(chat.title)}（${project ? `${project.name}・` : ""}${STATE_LOOKS[state].label}${busyUnread ? "・未読あり" : ""}）`}
        // 押すと開く・⌘ / Shift で選ぶ（開かない）・ダブルクリックか Enter で名前の変更・Space で開く・ドラッグでグループへ（chatList の chatItemProps）
        {...chatItemProps(chat, {
          open,
          rename: onRename,
          menu: openMenuAt,
          pick: selection ? (e) => selection.click(e, chat.id) : undefined,
          drag: { start: (e) => startChatDrag(e, chat.id) },
          as: { link: true },
        })}
      >
        <ChatRowFace
          mark={mark}
          lead={
            <>
              {project && <ProjectMark project={project} className="chat-row-project" />}
              {childMark && chat.parent_chat_id !== null && <ChildDepthMark chat={chat} />}
            </>
          }
          title={chatTitle(chat.title)}
          pinned={pinned}
          time={<ChatRowTime chat={chat} state={state} />}
          // 2 行目: グループと作業場所（ブランチ）（まとまりの見出しと重なる札は hideChip で隠し、札がなければ行ごと出さない）
          meta={
            <span className="chat-row-meta">
              {hideChip !== "group" && <GroupChip chat={chat} />}
              {hideChip !== "worktree" && <WorktreeChip chat={chat} markIconOnly />}
            </span>
          }
        />
      </a>
      {/* 乗せたとき・メニューを開いている間だけ出す「…」（時刻の上に重ねる）。行の中のリンクと分けて置く */}
      <span className={cx("chat-row-actions", menuOpen && "open")}>
        <IconButton
          size="sm"
          icon={Ellipsis}
          iconSize={14}
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
