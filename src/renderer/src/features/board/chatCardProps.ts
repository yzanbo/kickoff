import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import type { Chat } from "@shared/types";
import type { Placement } from "@/lib/floating";
import { chatTitle } from "@/features/chat/chatTitle";

/**
 * ボードのカード（リストの行も同じ）の操作をカード全体でそろえる:
 * クリック・Enter = チャットを開く / 右クリック = メニュー / ドラッグ = 移す（グループのボード。移し先はボードごと）。
 * カードの中のボタンを押したときは開かない
 */
export function chatCardProps(
  chat: Chat,
  {
    dragHint,
    onOpen,
    onMenu,
    onDragStart,
    onDragEnd,
    editing = false,
  }: {
    /** 読み上げる説明の「（ドラッグで…）」の部分（ドラッグできるボードだけ） */
    dragHint?: string;
    onOpen: () => void;
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
      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
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
