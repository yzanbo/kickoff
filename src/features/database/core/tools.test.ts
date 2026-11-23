// SQL のタブに SQL を入れて開くツール（kickoff_chat の open_sql）
import assert from "node:assert/strict";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import { testStore } from "@/app/core/testing/testStore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { callDef, testTurn } from "@/foundation/core/testing/toolCalls";
import { createAiConnections } from "./aiConnections";
import { openSqlToolGroup } from "./tools";

test("open_sql: AI に見せる接続だけを選べ（1 つなら省ける）、見せない接続は名前を出さずに断る", async () => {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: tempDir(), provider: "claude" });
  const root = store.chats.create({ project_id: project.id, provider: "claude", title: "根", status: "completed" });
  const child = store.chats.create({ project_id: project.id, provider: "claude", title: "子", status: "completed", parent_chat_id: root.id });
  const published: BusEvent[] = [];
  const [tool] = openSqlToolGroup({ store, databases: createAiConnections((id) => store.dbConnections.list(id)), publish: (e) => published.push(e) }).open(testTurn({ chatId: child.id }))!;
  const openSql = (args: Record<string, unknown>) => callDef(tool, args);
  const conn = (name: string, ai_access: "none" | "allow") =>
    store.dbConnections.create(project.id, { name, engine: "sqlite", environment: "dev", host: null, port: null, database: null, username: null, file_path: "app.db", ssl: null, read_only: false, ai_access });
  await assert.rejects(openSql({ sql: "SELECT 1" }), /AI に見せる DB の接続がありません/);
  conn("本番", "none");
  const dev = conn("開発", "allow");
  assert.match(await openSql({ sql: "  UPDATE users SET name = 'a' WHERE id = 1;  " }), /接続「開発」の新しい SQL のタブ/);
  const e = published[0];
  assert.ok(e.type === "open_view" && e.request.kind === "sql");
  assert.deepEqual([e.request.connection_id, e.request.sql, e.request.lineage.map((c) => c.id)], [dev.id, "UPDATE users SET name = 'a' WHERE id = 1;", [root.id, child.id]]);
  await assert.rejects(openSql({ sql: "SELECT 1", connection: "本番" }), /「本番」という AI に見せる接続はありません/);
  conn("ステージング", "allow");
  await assert.rejects(openSql({ sql: "SELECT 1" }), /connection に接続の名前/);
  assert.equal(published.length, 1);
});
