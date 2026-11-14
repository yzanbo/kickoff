import type { DatabaseSync } from "node:sqlite";
import type { Chat, ChatGroup } from "@shared/types";
import { pickProjectHue } from "@shared/project/colors";
import type { Notify } from "./common.js";

/** チャットを自分でまとめるグループ（chat_groups の表。プロジェクトごと）。getChat は、消したグループの中のチャットの変更を知らせるのに使う */
export function createGroupStore(db: DatabaseSync, onChange: Notify, getChat: (id: number) => Chat | undefined) {
  const get = (id: number): ChatGroup | undefined => db.prepare("SELECT * FROM chat_groups WHERE id = ?").get(id) as unknown as ChatGroup | undefined;
  const list = (projectId: number): ChatGroup[] =>
    db.prepare("SELECT * FROM chat_groups WHERE project_id = ? ORDER BY position, id").all(projectId) as unknown as ChatGroup[];
  /** そのプロジェクトのほかのグループと被らない色（プロジェクトの色と同じ選び方: いちばん使われていない色、同じならいちばん離れた色） */
  const freeHue = (projectId: number) =>
    pickProjectHue((db.prepare("SELECT hue FROM chat_groups WHERE project_id = ?").all(projectId) as { hue: number }[]).map((r) => r.hue));
  return {
    get,
    list,
    create(projectId: number, name: string): ChatGroup {
      const { next } = db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM chat_groups WHERE project_id = ?").get(projectId) as { next: number };
      const { lastInsertRowid } = db
        .prepare("INSERT INTO chat_groups (project_id, name, position, hue) VALUES (?, ?, ?, ?)")
        .run(projectId, name, next, freeHue(projectId));
      const group = get(Number(lastInsertRowid))!;
      onChange({ type: "group", group });
      return group;
    },
    rename(id: number, name: string): ChatGroup {
      db.prepare("UPDATE chat_groups SET name = ? WHERE id = ?").run(name, id);
      const group = get(id)!;
      onChange({ type: "group", group });
      return group;
    },
    /** ids の順に並べ直す（ほかのプロジェクトのグループは無視する） */
    reorder(projectId: number, ids: number[]): ChatGroup[] {
      const stmt = db.prepare("UPDATE chat_groups SET position = ? WHERE id = ? AND project_id = ?");
      ids.forEach((id, i) => stmt.run(i, id, projectId));
      const groups = list(projectId);
      for (const group of groups) onChange({ type: "group", group });
      return groups;
    },
    /** グループを消す。中のチャットは消さず、グループなしに戻す（外部キーの ON DELETE SET NULL） */
    delete(id: number) {
      const group = get(id);
      if (!group) return;
      const members = db.prepare("SELECT id FROM chats WHERE group_id = ? AND trashed_at IS NULL").all(id) as { id: number }[];
      db.prepare("DELETE FROM chat_groups WHERE id = ?").run(id);
      for (const { id: chatId } of members) onChange({ type: "chat", chat: getChat(chatId)! });
      onChange({ type: "group_deleted", id, project_id: group.project_id });
    },
  };
}
