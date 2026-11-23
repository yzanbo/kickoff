// チャットの AI が流した SQL（db_query）・用意した SQL（open_sql）を、そのチャットの右の欄の DB クライアントの新しい SQL のタブで開く
import type { Chat } from "@shared/chat/types";
import type { DbConnection } from "@shared/database/types";
import { parsePopout } from "@/foundation/ui/navigation/popout";
import { postToMainWindow } from "@/foundation/ui/navigation/windowBus";
import { openInRootSide, rootChatOf, knownChat } from "@/features/chat/ui";
import { openNewSqlTab } from "@/features/database/ui/state/dbClientTabs";
import { dbSurfaceKey } from "@/features/database/ui/state/surface";
import { readSetting, writeSetting } from "@/foundation/ui/storage";
import { storage } from "@/features/database/ui/storage";
import { dbClientTabs } from "@/foundation/ui/storage/storageKeys";
import { openTab } from "@/features/panel/ui";
import { projectViewTab } from "@/features/projects/ui";

/**
 * 右の欄（子チャットなら、いちばん上の親の右の欄）の DB クライアントに、その接続の新しい SQL のタブを足して sql を書き、DB クライアントを開く。
 * 開いているタブは localStorage に置くので、別ウィンドウの中からはタブだけ足して、開くのはメインのウィンドウに頼む
 */
export function openSqlInChat(chat: Pick<Chat, "id" | "project_id" | "parent_chat_id" | "worktree_path">, connection: Pick<DbConnection, "id">, sql: string) {
  const root = rootChatOf(chat, (id) => knownChat(id));
  const surfaceKey = dbSurfaceKey({ kind: "chat", chatId: root.id });
  const next = openNewSqlTab(readSetting(dbClientTabs(surfaceKey)), connection.id);
  // SQL のタブは開いたときに書きかけを読むので、先に書いておく
  if (next.active) writeSetting(storage.settings.sqlDraft(`${surfaceKey}:${next.active}`), sql);
  writeSetting(dbClientTabs(surfaceKey), next);
  const target = { chatId: root.id, projectId: chat.project_id, ...(chat.worktree_path ? { worktree: chat.worktree_path } : {}) };
  if (parsePopout(location.hash) !== undefined) return postToMainWindow("dockPopout", { route: { kind: "database", ...target } });
  openInRootSide(chat.id, (_rootId, side) => openTab(side, projectViewTab({ ...target, view: "db" })));
}
