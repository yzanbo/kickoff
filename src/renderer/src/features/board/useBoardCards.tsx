import { useState, type CSSProperties, type DragEvent } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { cx } from "@/lib/cx";
import { startChatDrag } from "@/features/group/groups";
import type { useChatRename } from "@/features/chat/useChatRename";
import type { PanelController } from "@/features/panel/usePanel";
import { useBoardListCompact } from "./BoardHeader";
import { ChatCardContent, ChatRowContent } from "./ChatCard";
import { chatCardProps } from "./chatCardProps";
import { useContextMenu } from "@/ui/useContextMenu";

/** カードの右クリックメニュー（どこに・どのチャットの。開いている間はパネルを Esc で閉じない: usePanel の holdEsc に isOpen を渡す） */
export const useCardMenu = () => useContextMenu<Chat>();

interface Options {
  /** 右のパネル（表示中のチャットのカードを選択中に見せる。全プロジェクトのボードはパネルを持たない） */
  panel?: PanelController;
  rename: ReturnType<typeof useChatRename>;
  menu: ReturnType<typeof useCardMenu>;
  /** カードを押したとき（プロジェクトのボードはパネルで開いて URL も変える。全プロジェクトのボードはそのプロジェクトへ移って開く） */
  onOpen: (chat: Chat) => void;
  /** 押すと何が起きるかの説明（乗せたときに出す。全プロジェクトのボードの「プロジェクト「○○」で開く」） */
  openTitle?: (chat: Chat) => string | undefined;
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
export function useBoardCards({ panel, rename, menu, onOpen, openTitle, drag, classFor, style, projectName }: Options) {
  const { pendingCount, stateOf } = useChatStates();
  // リストの行を 1 行にまとめるか（見出しの切り替えとそろう）
  const [compactRows] = useBoardListCompact();
  // ドラッグしている途中のチャット（薄く出す）
  const [dragChat, setDragChat] = useState<number>();
  const cardProps = (chat: Chat) => ({
    ...chatCardProps(chat, {
      dragHint: drag?.hint,
      onOpen: () => onOpen(chat),
      onMenu: (at) => menu.openAt(at, chat),
      onDragStart: drag
        ? (e: DragEvent) => {
            // 薄く出す（dragging）のは、ドラッグの絵を写したあと
            startChatDrag(e, chat.id, () => setDragChat(chat.id));
          }
        : undefined,
      onDragEnd: drag ? () => setDragChat(undefined) : undefined,
      editing: Boolean(rename.editorFor(chat)),
    }),
    title: openTitle?.(chat),
    style: style?.(chat),
  });
  const cardClass = (chat: Chat) => cx(chat.archived_at && "archived", classFor?.(chat), dragChat === chat.id && "dragging", panel?.isShowing(chat.id) && "selected");
  return {
    cardProps,
    cardClass,
    /** ボードのカード */
    card: (chat: Chat) => (
      <article key={chat.id} className={cx("board-card", cardClass(chat))} {...cardProps(chat)}>
        <ChatCardContent chat={chat} state={stateOf(chat)} projectName={projectName?.(chat)} pending={pendingCount(chat.id)} rename={rename.editorFor(chat)} />
      </article>
    ),
    /** リストの行 */
    row: (chat: Chat) => (
      <div key={chat.id} className={cx("list-row", compactRows && "compact", cardClass(chat))} {...cardProps(chat)}>
        <ChatRowContent chat={chat} state={stateOf(chat)} projectName={projectName?.(chat)} rename={rename.editorFor(chat)} />
      </div>
    ),
  };
}
