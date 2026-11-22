import { useState, type CSSProperties, type DragEvent } from "react";
import type { Chat, FeedItem } from "@shared/chat/types";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { cx } from "@/foundation/ui/lib/cx";
import { startChatDrag } from "@/features/groups/ui/groups";
import type { useChatRename } from "@/features/chat/ui/useChatRename";
import type { PanelController } from "@/features/panel/ui/usePanel";
import { ChatCardContent, ChatRowContent } from "./ChatCard";
import { FeedCardContent } from "./FeedList";
import { chatCardProps } from "./chatCardProps";
import { useCardFields } from "./CardFieldsMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";
import type { ChatSelection } from "@/features/chatList/ui";

/** ボードのカード・リストの行の、画面に出ている上からの並び（閉じている段・まとまりの中は除く。ボードで選ぶときの範囲） */
export const boardCardIds = () =>
  [...document.querySelectorAll<HTMLElement>(".board-main [data-chat-id]")]
    .filter((el) => !el.closest("[inert]") && !el.closest(".collapse:not(.open)"))
    .map((el) => Number(el.dataset.chatId));

/** カードの右クリックメニュー（どこに・どのチャットの。開いている間はパネルを Esc で閉じない: パネルはメニューの開いている間の Esc を見送る） */
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
  /** ドラッグで移せるボード（全プロジェクトのボードのグループの列）だけ。hint は読み上げの「（ドラッグで…）」 */
  drag?: { hint: string };
  /** ボードごとのカードのクラス（プロジェクト名つきなど。共通の archived の後・selected より前に付く） */
  classFor?: (chat: Chat) => string | false | undefined;
  style?: (chat: Chat) => CSSProperties | undefined;
  /** 全プロジェクトのボードでは、カードにプロジェクト名を出す */
  projectName?: (chat: Chat) => string | undefined;
  /** ⌘ / Shift ＋クリックで選んだカード（サイドバーと同じ決まり。ボードごとに 1 つ） */
  selection?: ChatSelection;
}

/**
 * ボードのカード（ボードの表示）と行（リストの表示）・フィードのカードの描き方（出す項目はツールバーの「表示項目」 useCardFields）。すべてのボードで共通:
 * クリック・Space で開く / Enter で名前を変える / 右クリックでメニュー / ドラッグで移す（全プロジェクトのボードのグループの列だけ）/ 名前をその場で変える。
 * どのボードでも、アーカイブ済みのカードは archived（ArchivedFold の中で薄く出す）、カード・行には回答待ちの依頼の数（「回答 n件」）を付ける。
 * パネルで表示中なら selected（チャットはどれもサイドバーと連動してタブにあるので、タブで開いているかの印は付けない）。
 * ⌘ / Shift ＋クリックで選んだカードは multi-selected で、その 1 つを右クリックすると選んだものすべてのメニュー（selection.openMenu。中身はサイドバーと同じ SelectionBar）
 */
export function useBoardCards({ panel, rename, menu, onOpen, openTitle, drag, classFor, style, projectName, selection }: Options) {
  const { pendingCount, stateOf } = useChatStates();
  // 出す項目（ツールバーの「表示項目」。すべてのボードで共通）
  const show = useCardFields();
  // ドラッグしている途中のチャット（薄く出す）
  const [dragChat, setDragChat] = useState<number>();
  const cardProps = (chat: Chat) => ({
    ...chatCardProps(chat, {
      dragHint: drag?.hint,
      onOpen: () => onOpen(chat),
      onPick: selection && ((e) => selection.click(e, chat.id)),
      onRename: () => rename.start(chat),
      onMenu: (at) => {
        // 選んだいくつかのカードの 1 つなら、まとめて操作するメニュー。ほかのカードなら選んだものを外して、そのカードのメニュー
        if (selection?.has(chat.id) && selection.ids.size > 1) return selection.openMenu(at);
        selection?.clear();
        menu.openAt(at, chat);
      },
      onDragStart: drag
        ? (e: DragEvent) => {
            // 薄く出す（data-drag-source）のは、ドラッグの絵を写したあと
            startChatDrag(e, chat.id, () => setDragChat(chat.id));
          }
        : undefined,
      onDragEnd: drag ? () => setDragChat(undefined) : undefined,
      editing: Boolean(rename.editorFor(chat)),
    }),
    title: openTitle?.(chat),
    style: style?.(chat),
    "data-drag-source": dragChat === chat.id ? "" : undefined,
  });
  const cardClass = (chat: Chat) => cx(chat.archived_at && "archived", classFor?.(chat), panel?.isShowing(chat.id) && "selected", selection?.has(chat.id) && "multi-selected");
  return {
    cardProps,
    cardClass,
    /** ボードのカード */
    card: (chat: Chat) => (
      <article key={chat.id} className={cx("board-card", cardClass(chat))} {...cardProps(chat)}>
        <ChatCardContent chat={chat} state={stateOf(chat)} projectName={projectName?.(chat)} pending={pendingCount(chat.id)} rename={rename.editorFor(chat)} show={show} />
      </article>
    ),
    /** リストの行 */
    row: (chat: Chat) => (
      <div key={chat.id} className={cx("list-row", cardClass(chat))} {...cardProps(chat)}>
        <ChatRowContent chat={chat} state={stateOf(chat)} projectName={projectName?.(chat)} pending={pendingCount(chat.id)} rename={rename.editorFor(chat)} show={show} />
      </div>
    ),
    /** フィードのカード（チャットの最新の返答。全プロジェクトのボードだけ） */
    feedCard: (chat: Chat, item: FeedItem) => (
      <article key={chat.id} className={cx("board-card feed-card", cardClass(chat))} {...cardProps(chat)}>
        <FeedCardContent chat={chat} item={item} state={stateOf(chat)} projectName={projectName?.(chat) ?? ""} rename={rename.editorFor(chat)} show={show} />
      </article>
    ),
  };
}
