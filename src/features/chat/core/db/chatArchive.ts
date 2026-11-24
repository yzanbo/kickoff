// チャットのアーカイブ（しまう・戻す。子孫も）。chats の表の店（chats.ts）の中で使う
import type { DatabaseSync } from "node:sqlite";
import type { Chat } from "@shared/chat/types";
import { systemClock } from "@/foundation/core/clock";
import { bit, type Notify } from "@/foundation/core/db/common";

export function createChatArchive(db: DatabaseSync, onChange: Notify, get: (id: number) => Chat | undefined, descendants: (id: number) => Chat[]) {
  /** アーカイブの列を書いて、変更を知らせる（最後に動いた時刻は進めない） */
  const setArchived = (id: number, archivedAt: string | null, withParent: boolean) => {
    // しまったら、起動したときの再開の確かめでもう聞かない（戻しても聞かない）
    db.prepare(`UPDATE chats SET archived_at = ?, archived_with_parent = ?${archivedAt !== null ? ", resume_pending = 0" : ""} WHERE id = ?`).run(archivedAt, bit(withParent), id);
    onChange({ type: "chat", chat: get(id)! });
  };
  /** 子の行（親と一緒にアーカイブした印 archived_with_parent は店の中だけの列なので、Chat に直さずに読む） */
  const childRows = (id: number) => db.prepare("SELECT id, archived_at, archived_with_parent FROM chats WHERE parent_chat_id = ? AND trashed_at IS NULL ORDER BY id").all(id) as { id: number; archived_at: string | null; archived_with_parent: number }[];

  /**
   * アーカイブする・戻す（子孫も）。しまうときは、まだしまっていない子孫に「親と一緒にしまった」印を付けて一緒にしまう
   * （子チャットだけで先にしまっていたものは、そのまま）。戻すときは、印のある子孫だけを戻し、子チャットだけでしまっていたもの（とその下）はしまったまま。
   * 子チャットだけをしまう・戻すときは、親には触らない。しまったままもう一度しまっても、しまった日時は変えない
   */
  const archive = (id: number, archived: boolean, now = new Date(systemClock.now())): Chat => {
    const chat = get(id)!;
    if (archived) {
      const at = chat.archived_at ?? now.toISOString();
      setArchived(id, at, false);
      for (const c of descendants(id)) if (c.archived_at === null) setArchived(c.id, at, true);
    } else {
      setArchived(id, null, false);
      const restore = (parentId: number, depth: number) => {
        for (const c of childRows(parentId)) {
          if (c.archived_at !== null && c.archived_with_parent !== 1) continue;
          if (c.archived_at !== null) setArchived(c.id, null, false);
          if (depth < 50) restore(c.id, depth + 1);
        }
      };
      restore(id, 1);
    }
    return get(id)!;
  };
  return archive;
}
