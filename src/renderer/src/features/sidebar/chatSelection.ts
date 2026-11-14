import { createContext, useContext } from "react";
import type { Placement } from "@/lib/floating";
import { useMultiSelect } from "@/hooks/useMultiSelect";
import { useContextMenu } from "@/ui/useContextMenu";

/**
 * サイドバー・ボードで選んだチャット（それぞれ 1 つずつ持つ。決まりは useMultiSelect: ⌘ を押しながらクリックで足す・外す、Shift で前に選んだものからの範囲を足す。
 * ふつうのクリックで解く。範囲は画面の並び順）。
 * 選んだものは、下のまとめて操作する欄（SelectionBar）と右クリックのメニューで、まとめてアーカイブ・移動・既読・削除する
 */
export interface ChatSelection {
  ids: ReadonlySet<number>;
  has: (id: number) => boolean;
  /** 行のクリック（⌘ / Shift なら選んで true。修飾キーがなければ選ぶのをやめて false） */
  click: (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }, id: number) => boolean;
  /** 選んでいるものに足す（キーボードの Shift+↑↓） */
  add: (id: number) => void;
  clear: () => void;
  /** 選んでいるチャットを右クリックしたとき: まとめて操作するメニューを開く */
  openMenu: (at: Placement) => void;
  menuAt: Placement | null;
  closeMenu: () => void;
}

export const ChatSelectionContext = createContext<ChatSelection | null>(null);
export const useChatSelection = () => useContext(ChatSelectionContext);

/** サイドバーの行の要素（画面の並び順をここから取る） */
const CHAT_ROW_SELECTOR = ".workspaces a.chat-row[data-chat-id]";
/** 画面に出ている行の、上からの並び（横スライドの裏のプロジェクト（inert）・閉じているまとまりの中は除く） */
export const visibleRows = () =>
  [...document.querySelectorAll<HTMLElement>(CHAT_ROW_SELECTOR)].filter((el) => !el.closest("[inert]") && !el.closest(".collapse:not(.open)"));
const rowIds = () => visibleRows().map((el) => Number(el.dataset.chatId));

/** ボードのカード・リストの行の、画面に出ている上からの並び（閉じている段・まとまりの中は除く。ボードで選ぶときの範囲） */
export const boardCardIds = () =>
  [...document.querySelectorAll<HTMLElement>(".board-main [data-chat-id]")]
    .filter((el) => !el.closest("[inert]") && !el.closest(".collapse:not(.open)"))
    .map((el) => Number(el.dataset.chatId));

/** 選んでいる状態（existing: いまあるチャット。消えたものは選択から外す。order: 範囲を決める画面の並び。省けばサイドバーの行。ボードは boardCardIds） */
export function useChatSelectionState(existing: readonly number[], order: () => readonly number[] = rowIds): ChatSelection {
  const select = useMultiSelect(existing, order);
  // 選んだチャットをまとめて操作する右クリックのメニュー
  const menu = useContextMenu();
  return {
    ids: select.ids,
    has: select.has,
    click: select.click,
    add: select.add,
    clear: () => {
      select.clear();
      menu.close();
    },
    openMenu: (at) => menu.openAt(at),
    menuAt: menu.menu?.at ?? null,
    closeMenu: menu.close,
  };
}
