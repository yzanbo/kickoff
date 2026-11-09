import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import type { Chat } from "@shared/types";
import type { Placement } from "@/lib/floating";
import { chatTitle } from "@/features/chat/chatTitle";
import { isOpenKey, isRenameKey } from "@/lib/keys";

/**
 * ボードのカード（リストの行も同じ）の操作をカード全体でそろえる:
 * クリック・Space = チャットを開く / Enter = 名前を変え始める（Finder と同じ。利用者の依頼で、前は Enter でも開いていた）/ 右クリック = メニュー / ドラッグ = 移す（全プロジェクトのボードのグループの列）。
 * カードの中のボタンを押したときは開かない
 */
export function chatCardProps(
  chat: Chat,
  {
    dragHint,
    onOpen,
    onRename,
    onMenu,
    onDragStart,
    onDragEnd,
    editing = false,
  }: {
    /** 読み上げる説明の「（ドラッグで…）」の部分（ドラッグできるボードだけ） */
    dragHint?: string;
    onOpen: () => void;
    /** 名前を変え始める（カードにピントがあるときの Enter） */
    onRename: () => void;
    onMenu: (at: Placement) => void;
    /** ドラッグで移せるボードだけ渡す（カンバンの列は AI の状態で決まるので動かさない） */
    onDragStart?: (e: DragEvent) => void;
    onDragEnd?: () => void;
    /** 名前をその場で変えている途中（ドラッグしない） */
    editing?: boolean;
  },
) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": `チャット「${chatTitle(chat.title)}」を開く${dragHint ? `（${dragHint}）` : ""}`,
    draggable: Boolean(onDragStart) && !editing,
    onDragStart,
    onDragEnd,
    onClick: (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("button")) onOpen();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // カードの中の入力欄・ボタンのキーは見ない
      if (e.target !== e.currentTarget) return;
      if (isRenameKey(e)) {
        e.preventDefault();
        onRename();
      } else if (isOpenKey(e)) {
        e.preventDefault();
        onOpen();
      }
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      onMenu({ x: e.clientX, y: e.clientY });
    },
  };
}
