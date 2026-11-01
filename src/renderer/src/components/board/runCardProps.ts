import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import type { Run } from "../../../../core/types";
import { runTitle } from "./RunCard";

/**
 * ボードのカード（リストの行も同じ）の操作をカード全体でそろえる:
 * クリック・Enter = チャットを開く / 右クリック = メニュー / ドラッグ = 移す（移し先はボードごと）。
 * カードの中のボタン（列の移動など）を押したときは開かない
 */
export function runCardProps(
  run: Run,
  {
    dragHint,
    onOpen,
    onMenu,
    onDragStart,
    onDragEnd,
  }: {
    /** 読み上げる説明の「（ドラッグで…）」の部分 */
    dragHint: string;
    onOpen: () => void;
    onMenu: (at: { x: number; y: number }) => void;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
  },
) {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": `チャット「${runTitle(run)}」を開く（${dragHint}）`,
    draggable: true,
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
