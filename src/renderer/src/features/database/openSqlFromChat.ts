// チャットの AI が流した SQL（db_query）・用意した SQL（open_sql）を、そのチャットの右の欄の DB クライアントの新しい SQL のタブで開く
import type { Chat, DbConnection } from "@shared/types";
import { parsePopout } from "@/app/popout";
import { postToMainWindow } from "@/app/windowBus";
import { openInRootSide } from "@/features/chat/children/openChild";
import { rootChatOf } from "@/features/chat/children/childChats";
import { openNewSqlTab } from "@/lib/dbClientTabs";
import { readSetting, writeSetting } from "@/lib/storage";
import { dbClientTabs, dbSqlDraft } from "@/lib/storageKeys";
import { knownChat } from "@/stores/chats";

/**
 * 右の欄（子チャットなら、いちばん上の親の右の欄）の DB クライアントに、その接続の新しい SQL のタブを足して sql を書き、DB クライアントを開く。
 * 開いているタブは localStorage に置くので、別ウィンドウの中からはタブだけ足して、開くのはメインのウィンドウに頼む
 */
export function openSqlFromChat(chat: Pick<Chat, "id" | "project_id" | "parent_chat_id" | "worktree_path">, connection: Pick<DbConnection, "id">, sql: string) {
  const root = rootChatOf(chat, (id) => knownChat(id));
  const place = `chat-${root.id}`;
  const next = openNewSqlTab(readSetting(dbClientTabs(place)), connection.id);
  // SQL のタブは開いたときに書きかけを読むので、先に書いておく
  if (next.active) writeSetting(dbSqlDraft(`${place}:${next.active}`), sql);
  writeSetting(dbClientTabs(place), next);
  const target = { chatId: root.id, projectId: chat.project_id, ...(chat.worktree_path ? { worktree: chat.worktree_path } : {}) };
  if (parsePopout(location.hash) !== undefined) return postToMainWindow({ type: "dockPopout", route: { kind: "database", ...target } });
  openInRootSide(chat.id, (_rootId, side) => side.openDatabase(target));
}
