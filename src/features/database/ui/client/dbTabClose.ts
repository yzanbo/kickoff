// DB クライアントのタブを閉じる前の確かめ（種類ごとの表。やめたら false で、タブを閉じない）
import type { DbConnection } from "@shared/database/types";
import { confirm } from "@/foundation/ui/kit/ask";
import { writeSetting } from "@/foundation/ui/storage";
import type { DbClientTab } from "@/features/database/ui/dbClientTabs";
import { finishSession } from "@/features/database/ui/state/sqlSessions";
import { unsavedKey, unsavedTables } from "@/features/database/ui/state/tabFlags";
import { storage } from "@/features/database/ui/storage";

interface CloseContext {
  projectId: number;
  surfaceKey: string;
  /** タブの接続（消した接続なら undefined） */
  connection: DbConnection | undefined;
}

type CloseCheck<K extends DbClientTab["kind"]> = (ctx: CloseContext, tab: Extract<DbClientTab, { kind: K }>) => Promise<boolean>;

const DB_TAB_CLOSE: { [K in DbClientTab["kind"]]: CloseCheck<K> } = {
  // 保存していない変更があれば、捨てるか聞く
  table: async ({ surfaceKey }, tab) =>
    !unsavedTables.has(unsavedKey(surfaceKey, tab.key)) ||
    (await confirm({ title: "保存していない変更があります", message: `「${tab.name}」の変更を保存せずに閉じますか？変更は捨てます。`, confirmLabel: "捨てて閉じる", danger: true })) !== null,
  // コミットしていなければ聞き、DB の接続を閉じて書きかけの SQL を消す
  sql: async ({ projectId, surfaceKey, connection }, tab) => {
    if (connection && !(await finishSession(projectId, connection, tab.key))) return false;
    writeSetting(storage.settings.sqlDraft(`${surfaceKey}:${tab.key}`), "");
    return true;
  },
  er: async () => true,
  note: async () => true,
};

/** タブを閉じてよいか（閉じる前の後片付けも済ませる） */
export const canCloseDbTab = (ctx: CloseContext, tab: DbClientTab): Promise<boolean> => (DB_TAB_CLOSE[tab.kind] as CloseCheck<DbClientTab["kind"]>)(ctx, tab as never);
