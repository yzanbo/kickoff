import assert from "node:assert/strict";
import { test } from "vitest";
import type { DbConnection } from "@shared/database/types";
import { describeView, viewDescribers } from "@/foundation/ui/shell/viewDescribers";
import { writeSetting } from "@/foundation/ui/storage";
import { installMemoryStorage } from "@/foundation/ui/testing/memoryStorage";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { NO_DB_TABS, openNewSqlTab, openTableTab, tableTabKey } from "@/features/database/ui/dbClientTabs";
import { dbConnectionsStore } from "@/features/database/ui/state/connectionsStore";
import { storage } from "@/features/database/ui/storage";
import { databaseDescriber } from "./viewDescriber";

installMemoryStorage();

const path = { database: "main", schema: null };

test("DB の画面の説明（get_user_view）: 置き場所の前のタブの接続の名前とテーブル。SQL のタブならテーブルなし、接続が読めなければ番号", () => {
  useTestContributions([viewDescribers.item(databaseDescriber)]);
  dbConnectionsStore.set(91, [{ id: 3, name: "本番 DB" } as DbConnection]);
  const tabs = openTableTab(NO_DB_TABS, { key: tableTabKey(3, path, "users"), kind: "table", connection_id: 3, path, name: "users", object: "table" });
  writeSetting(storage.settings.tabs("project-91"), tabs);
  assert.deepEqual(describeView("db", { projectId: 91, surface: "project-91" }), { kind: "database", connection: "本番 DB", table: "users", project_id: 91 });
  // 別の置き場所（チャットの右の欄）は、その置き場所のタブ
  assert.deepEqual(describeView("db", { projectId: 91, surface: "chat-5" }), { kind: "database", connection: null, table: null, project_id: 91 });
  writeSetting(storage.settings.tabs("chat-5"), openNewSqlTab(NO_DB_TABS, 4));
  assert.deepEqual(describeView("db", { projectId: 91, surface: "chat-5" }), { kind: "database", connection: "接続 4", table: null, project_id: 91 });
});
