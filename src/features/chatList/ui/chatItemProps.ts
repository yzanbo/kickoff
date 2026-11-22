import type { DragEvent, KeyboardEvent, MouseEvent } from "react";
import type { Chat } from "@shared/chat/types";
import type { Placement } from "@/foundation/ui/lib/floating";
import { isOpenKey, isRenameKey } from "@/foundation/ui/lib/keys";
import { chatTitle } from "@/features/chat/ui";

export interface ChatItemOptions {
  open(): void;
  /** 名前を変え始める（ピントがあるときの Enter・リンクの行のダブルクリック） */
  rename(): void;
  menu(at: Placement): void;
  /** クリック（⌘ / Shift なら選んで true = 開かない。修飾キーがなければ選んだものを外して false） */
  pick?(e: MouseEvent): boolean;
  /** ドラッグで移せるときだけ（ボードの状態の列は AI の状態で決まるので動かさない） */
  drag?: { start(e: DragEvent): void; end?(): void };
  /** 名前をその場で変えている途中（ドラッグしない） */
  editing?: boolean;
  /**
   * 描く要素: link = サイドバーの行（<a>。押したときの移動を止め、ダブルクリックでも名前を変える）/
   * button = ボードのカード・リストの行（role="button"・Tab で移れる・読み上げの説明。dragHint はその「（ドラッグで…）」）
   */
  as: { link: true } | { button: true; dragHint?: string };
}

/**
 * チャットの行とカードの同じ操作（サイドバー・ボード）: クリック・Space = 開く / ⌘ / Shift ＋クリック = 選ぶ（開かない）/ Enter = 名前を変え始める（Finder と同じ）/
 * 右クリック = メニュー / ドラッグ = 移す。中のボタンを押したとき・中の入力欄のキーでは開かない
 */
export function chatItemProps(chat: Chat, { open, rename, menu, pick, drag, editing = false, as }: ChatItemOptions) {
  const link = "link" in as;
  return {
    ...("button" in as && {
      role: "button",
      tabIndex: 0,
      "aria-label": `チャット「${chatTitle(chat.title)}」を開く${as.dragHint ? `（${as.dragHint}）` : ""}`,
    }),
    // 画面の並び（Shift ＋クリックの範囲）を読む印
    "data-chat-id": chat.id,
    // 乗せて少し待ったら先読みする（chat の hoverPrefetch）
    "data-prefetch-chat": chat.id,
    draggable: Boolean(drag) && !editing,
    onDragStart: drag?.start,
    onDragEnd: drag?.end,
    ...(link && {
      onDoubleClick: (e: MouseEvent) => {
        e.preventDefault();
        rename();
      },
    }),
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      menu({ x: e.clientX, y: e.clientY });
    },
    onClick: (e: MouseEvent) => {
      if (link) e.preventDefault();
      if ((e.target as HTMLElement).closest("button")) return;
      if (!pick?.(e)) open();
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (isRenameKey(e)) {
        e.preventDefault();
        rename();
      } else if (isOpenKey(e)) {
        e.preventDefault();
        open();
      }
    },
  };
}
