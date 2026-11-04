import { useState, type CSSProperties, type DragEvent } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { startChatDrag } from "@/features/group/groups";
import type { useChatRename } from "@/features/chat/useChatRename";
import type { PanelController } from "@/features/panel/usePanel";
import type { BoardEntry } from "@/features/chatList/boardColumns";
import { useBoardListCompact } from "./BoardHeader";
import { ChatCardContent, ChatRowContent } from "./ChatCard";
import { chatCardProps } from "./chatCardProps";

/** カードの右クリックメニューの状態（どこに・どのチャットの） */
export type ChatMenuAt = { x: number; y: number; chat: Chat };

/** カードの右クリックメニュー（開いている間はパネルを Esc で閉じない: usePanel の holdEsc に isOpen を渡す） */
export function useCardMenu() {
  const [at, setAt] = useState<ChatMenuAt | null>(null);
  return { at, isOpen: at !== null, open: (where: { x: number; y: number }, chat: Chat) => setAt({ ...where, chat }), close: () => setAt(null) };
}

interface Options {
  panel: PanelController;
  rename: ReturnType<typeof useChatRename>;
  menu: ReturnType<typeof useCardMenu>;
  /** カードを押したとき（パネルで開く。プロジェクトのボードは URL も変える） */
  onOpen: (chat: Chat) => void;
  /** ドラッグで移せるボード（グループのボード）だけ。hint は読み上げの「（ドラッグで…）」 */
  drag?: { hint: string };
  /** ボードごとのカードのクラス（プロジェクト名つきなど。共通の archived の後・selected より前に付く） */
  classFor?: (chat: Chat) => string | false | undefined;
  style?: (chat: Chat) => CSSProperties | undefined;
  /** 全プロジェクトのボードでは、カードにプロジェクト名を出す */
  projectName?: (chat: Chat) => string | undefined;
}

/**
 * ボードのカード（ボードの表示）と行（リストの表示）の描き方。カンバンとグループのボードで共通:
 * クリック・Enter で開く / 右クリックでメニュー / ドラッグで移す（グループのボードだけ）/ 名前をその場で変える。
 * どのボードでも、アーカイブ済みのカードは archived（ArchivedFold の中で薄く出す）、ボードのカードには回答待ちの依頼の数（「回答 n件」）を付ける。
 * パネルで表示中なら selected（チャットはどれもサイドバーと連動してタブにあるので、タブで開いているかの印は付けない）
 */
export function useBoardCards({ panel, rename, menu, onOpen, drag, classFor, style, projectName }: Options) {
  const { pendingCount } = useChatStates();
  // リストの行を 1 行にまとめるか（見出しの切り替えとそろう）
  const [compactRows] = useBoardListCompact();
  // ドラッグしている途中のチャット（薄く出す）
  const [dragChat, setDragChat] = useState<number>();
  const cardProps = (chat: Chat) => ({
    ...chatCardProps(chat, {
      dragHint: drag?.hint,
      onOpen: () => onOpen(chat),
      onMenu: (at) => menu.open(at, chat),
      onDragStart: drag
        ? (e: DragEvent) => {
            startChatDrag(e, chat.id);
            setDragChat(chat.id);
          }
        : undefined,
      onDragEnd: drag ? () => setDragChat(undefined) : undefined,
      editing: Boolean(rename.editorFor(chat)),
    }),
    style: style?.(chat),
  });
  const cardClass = (chat: Chat) => cx(chat.archived_at && "archived", classFor?.(chat), dragChat === chat.id && "dragging", panel.isShowing(chat.id) && "selected");
  return {
    cardProps,
    cardClass,
    /** ボードのカード */
    card: ({ chat, state }: BoardEntry) => (
      <article key={chat.id} className={cx("board-card", cardClass(chat))} {...cardProps(chat)}>
        <ChatCardContent chat={chat} state={state} projectName={projectName?.(chat)} pending={pendingCount(chat.id)} rename={rename.editorFor(chat)} />
      </article>
    ),
    /** リストの行 */
    row: ({ chat, state }: BoardEntry) => (
      <div key={chat.id} className={cx("list-row", compactRows && "compact", cardClass(chat))} {...cardProps(chat)}>
        <ChatRowContent chat={chat} state={state} projectName={projectName?.(chat)} rename={rename.editorFor(chat)} />
      </div>
    ),
  };
}
