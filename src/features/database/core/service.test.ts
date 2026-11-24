// DB クライアントのサービスの、HTTP で見られない中身: 接続を消したら、その接続のワーカーの接続（SQL のタブの途中のトランザクション）を閉じる
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { databaseServiceOf, sqliteBody } from "./testing";


test("接続を消すと、その接続のワーカーの接続（SQL のタブの途中のトランザクションも）を閉じる。ほかの接続はそのまま", async () => {
  const core = setup({ features: ["database"] });
  const { store, project } = core;
  new DatabaseSync(path.join(project.repo_path, "app.db")).close();
  const databases = databaseServiceOf(core);
  const conn = store.dbConnections.create(project.id, sqliteBody({ name: "消す" }));
  const other = store.dbConnections.create(project.id, sqliteBody({ name: "ほか" }));
  const begin = (c: typeof conn) => databases.sql({ connection: c, project, workdir: null }, { session: "tab1", sql: "begin", write: false });
  await begin(conn);
  await begin(other);
  assert.equal(databases.inTransaction(conn, "tab1"), true);
  databases.removeConnection(conn.id);
  await until(() => !databases.inTransaction(conn, "tab1"));
  assert.equal(databases.inTransaction(other, "tab1"), true);
});
