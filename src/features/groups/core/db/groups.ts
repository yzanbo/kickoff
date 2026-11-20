import type { DatabaseSync } from "node:sqlite";
import type { Chat } from "@shared/chat/types";
import type { ChatGroup } from "@shared/groups/types";
import { pickProjectHue } from "@shared/projects/colors";
import type { Notify } from "@/foundation/core/db/common";
import { chatGroupsTable } from "@/features/groups/core/schema";

/** グループの中のチャット（chats の表は chat の持ち物なので、店の束が chat の店から渡す） */
export interface GroupMembers {
  /** そのグループのチャット（ゴミ箱のものを除く）の番号 */
  idsIn(group: ChatGroup): number[];
  getChat(id: number): Chat | undefined;
}

export type GroupStore = ReturnType<typeof createGroupStore>;

/** チャットを自分でまとめるグループ（chat_groups の表。プロジェクトごと） */
export function createGroupStore(db: DatabaseSync, onChange: Notify, members: GroupMembers) {
  const rows = chatGroupsTable.on(db, (change) => {
    if (change.kind === "upsert") onChange({ type: "group", group: change.row });
  });
  const list = (projectId: number): ChatGroup[] => rows.list("project_id = ?", [projectId]);
  return {
    get: (id: number): ChatGroup | undefined => rows.get(id),
    list,
    create(projectId: number, name: string): ChatGroup {
      // そのプロジェクトのほかのグループと被らない色（プロジェクトの色と同じ選び方: いちばん使われていない色、同じならいちばん離れた色）
      const hue = pickProjectHue(list(projectId).map((g) => g.hue));
      return rows.insert({ project_id: projectId, name, hue });
    },
    rename: (id: number, name: string): ChatGroup => rows.update(id, { name }),
    /** ids の順に並べ直す（ほかのプロジェクトのグループは無視し、書いていないものは後ろに続ける） */
    reorder: (projectId: number, ids: number[]): ChatGroup[] => rows.reorder(ids, projectId),
    /** グループを消す。中のチャットは消さず、グループなしに戻す（外部キーの ON DELETE SET NULL）。戻したチャットも知らせる */
    delete(id: number) {
      const group = rows.get(id);
      if (!group) return;
      const chatIds = members.idsIn(group);
      rows.remove(id);
      for (const chatId of chatIds) onChange({ type: "chat", chat: members.getChat(chatId)! });
      onChange({ type: "group_deleted", id, project_id: group.project_id });
    },
  };
}
