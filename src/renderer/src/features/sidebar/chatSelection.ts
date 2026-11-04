import { createContext, useContext, useState } from "react";
import type { Placement } from "@/lib/floating";

/**
 * サイドバーで選んだチャット（⌘ を押しながらクリックで足す・外す、Shift で前に選んだものからの範囲。ふつうのクリックで解く）。
 * 選んだものは、下のまとめて操作する欄（SelectionBar）と右クリックのメニューで、まとめてアーカイブ・移動・既読・削除する
 */
export interface ChatSelection {
  ids: Set<number>;
  has: (id: number) => boolean;
  toggle: (id: number) => void;
  /** 前に選んだもの（なければこれだけ）からこれまでを、画面の並び順で選ぶ */
  range: (id: number) => void;
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

/** 選んでいる状態（existing: いまあるチャット。消えたものは選択から外す） */
export function useChatSelectionState(existing: Set<number>): ChatSelection {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<Placement | null>(null);
  const ids = new Set([...picked].filter((id) => existing.has(id)));
  return {
    ids,
    has: (id) => ids.has(id),
    toggle: (id) => {
      // 続けて押しても取りこぼさないよう、いまの値から足す・外す
      setPicked((prev) => {
        const next = new Set([...prev].filter((x) => existing.has(x)));
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      setAnchor(id);
    },
    range: (id) => {
      const order = rowIds();
      const from = anchor !== null ? order.indexOf(anchor) : -1;
      const to = order.indexOf(id);
      if (from < 0 || to < 0) {
        setPicked(new Set([id]));
        setAnchor(id);
        return;
      }
      const [a, b] = from < to ? [from, to] : [to, from];
      setPicked(new Set([...ids, ...order.slice(a, b + 1)]));
    },
    add: (id) => {
      // 続けて呼んでも取りこぼさないよう、いまの値に足す
      setPicked((prev) => new Set([...[...prev].filter((x) => existing.has(x)), id]));
      if (anchor === null) setAnchor(id);
    },
    clear: () => {
      if (ids.size > 0) setPicked(new Set());
      setAnchor(null);
      setMenuAt(null);
    },
    openMenu: setMenuAt,
    menuAt,
    closeMenu: () => setMenuAt(null),
  };
}
