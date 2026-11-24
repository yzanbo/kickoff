// サイドバーのチャットの行・下書きの行のクラス（ピン留めの薄い背景・選択中・未読の太字など）と、ピンを出すかの決め方
import type { Chat } from "@shared/chat/types";
import { cx } from "@/foundation/ui/lib/cx";

/** ピン留めの背景と印を出すか（アーカイブしたチャットは出さない） */
export const showsPinned = (chat: Pick<Chat, "pinned" | "archived_at">): boolean => chat.pinned && !chat.archived_at;

/** チャットの行のクラス（名前の変更中は押せない枠なので、ピン留めと選択中だけ） */
export function chatRowClass(row: { pinned: boolean; active: boolean; renaming?: boolean; archived?: boolean; selected?: boolean; bold?: boolean }): string {
  if (row.renaming) return cx("chat-row", "renaming", row.pinned && "pinned", row.active && "active");
  return cx("chat-row", row.pinned && "pinned", row.archived && "archived", row.active && "active", row.selected && "multi-selected", row.bold && "is-unread");
}

/** 下書きの行のクラス（チャットの行と同じピン留めの背景） */
export const draftRowClass = (row: { pinned: boolean; selected: boolean; renaming?: boolean }): string =>
  cx(row.renaming ? "chat-row draft-row renaming" : "chat-row draft-row", row.pinned && "pinned", row.selected && "active");
