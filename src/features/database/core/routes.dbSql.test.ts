// API のテスト: SQL のタブ（流す・トランザクション・さらに読む・接続を切る・接続の状態・AI に頼む・履歴・読み取り専用・行の変更の保存）
// DB ワーカーは同じプロセスで動かす（testing/testServer.ts の setup({ features: ["database"] })）。本物のプロセスでの起動は core/workerClient.test.ts
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { DB_SQL_MAX_ROWS, type DbConnection, type DbQueryHistoryEntry, type DbQueryResult } from "@shared/database/types";
import type { BusEvent } from "@shared/foundation/contract";
import { setup } from "@/app/core/testing/testServer";
import { until } from "@/app/core/testing/testCore";
import { quietShell } from "@/foundation/core/testing/quietShell";
import { makeSqlite, sqliteBody } from "@/features/database/core/testing";

quietShell();

test("SQL のタブ: 文を流す・トランザクションの途中の印・コミットと取り消し・閉じると取り消す", async () => {
  const { call, project } = setup({ features: ["database"] });
  const file = makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const sql = (s: string, session = "tab1", write = false) => call("POST", `${base}/sql`, { session, sql: s, write });

  const selected = (await sql("select id, name from users order by id")).body as DbQueryResult;
  assert.deepEqual(
    selected.columns.map((c) => c.name),
    ["id", "name"],
  );
  assert.equal(selected.rows.length, 3);
  assert.equal(selected.in_transaction, false);

  assert.equal((await sql("begin")).body.in_transaction, true);
  const inserted = (await sql("insert into users (name) values ('d')")).body as DbQueryResult;
  assert.equal(inserted.affected, 1);
  assert.equal(inserted.in_transaction, true);
  assert.deepEqual((await call("GET", `${base}/sessions/tab1`)).body, { in_transaction: true });
  // ほかのタブ（別の接続）からはまだ見えない
  assert.equal(((await sql("select count(*) as n from users", "tab2")).body as DbQueryResult).rows[0][0], 3);
  assert.deepEqual((await call("POST", `${base}/sessions/tab1/rollback`)).body, { in_transaction: false });
  assert.equal(((await sql("select count(*) from users", "tab2")).body as DbQueryResult).rows[0][0], 3);

  await sql("begin");
  await sql("insert into users (name) values ('e')");
  assert.deepEqual((await call("POST", `${base}/sessions/tab1/commit`)).body, { in_transaction: false });
  assert.equal(((await sql("select count(*) from users", "tab2")).body as DbQueryResult).rows[0][0], 4);

  // 閉じると途中のトランザクションは取り消す
  await sql("begin");
  await sql("insert into users (name) values ('f')");
  assert.equal((await call("DELETE", `${base}/sessions/tab1`)).status, 204);
  const check = new DatabaseSync(file);
  assert.equal((check.prepare("select count(*) as n from users").get() as { n: number }).n, 4);
  check.close();

  // 失敗は文のまま 400
  const failed = await sql("select * from nope");
  assert.equal(failed.status, 400);
  assert.match(failed.body.error, /no such table/);
});

test("SQL のタブ: 「さらに読む」は読み取りの文を流し直して頭を飛ばし、続きの 1000 行を返す（書く文は断る・履歴に残さない）", async () => {
  const { call, project } = setup({ features: ["database"] });
  const file = makeSqlite(project.repo_path);
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE nums (n INTEGER PRIMARY KEY); WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 2500) INSERT INTO nums SELECT x FROM c;");
  db.close();
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const run = (offset?: number, sql = "SELECT n FROM nums ORDER BY n") => call("POST", `${base}/sql`, { session: "more", sql, write: false, offset });
  const first = (await run()).body as DbQueryResult;
  assert.equal(first.rows.length, DB_SQL_MAX_ROWS);
  assert.equal(first.truncated, true);
  const second = (await run(1000)).body as DbQueryResult;
  assert.equal(second.rows[0][0], 1001);
  assert.equal(second.truncated, true);
  const last = (await run(2000)).body as DbQueryResult;
  assert.equal(last.rows.length, 500);
  assert.equal(last.truncated, false);
  assert.equal((await run(1000, "DELETE FROM nums")).status, 400);
  const history = (await call("GET", `${base}/history`)).body as DbQueryHistoryEntry[];
  assert.equal(history.length, 1);
});

test("接続を切る: コミットしていない SQL のタブがあれば切らずに返し、force なら取り消して切る。次に使えばつなぎ直す", async () => {
  const { call, project } = setup({ features: ["database"] });
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const sql = (s: string, session = "tab1") => call("POST", `${base}/sql`, { session, sql: s, write: false });
  assert.equal((await call("POST", `${base}/disconnect`, {})).body.disconnected, true);
  await sql("BEGIN");
  await sql("UPDATE users SET name = 'z' WHERE id = 1");
  assert.deepEqual((await call("POST", `${base}/disconnect`, {})).body, { disconnected: false, pending_sessions: ["tab1"] });
  assert.deepEqual((await call("POST", `${base}/disconnect`, { force: true })).body, { disconnected: true, pending_sessions: ["tab1"] });
  // 取り消したので、変更は残っていない
  const after = (await sql("SELECT name FROM users WHERE id = 1")).body as DbQueryResult;
  assert.equal(after.rows[0][0], "b");
  assert.equal(after.in_transaction, false);
});

test("接続の状態: 木・SQL のタブの接続を開いたらつないだ、すべて閉じたら切れたと知らせる（AI・行の保存の接続は数えない）", async () => {
  const { call, project, bus } = setup({ features: ["database"] });
  const events: BusEvent[] = [];
  bus.subscribe((e) => e.type === "db_connection_state" && events.push(e));
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const list = `/api/projects/${project.id}/db-connections`;
  const base = `${list}/${conn.id}`;
  assert.deepEqual((await call("GET", `${list}/connected`)).body, { ids: [] });
  await call("POST", `${base}/sql`, { session: "tab1", sql: "SELECT 1", write: false });
  await call("POST", `${base}/sql`, { session: "tab2", sql: "SELECT 1", write: false });
  assert.deepEqual((await call("GET", `${list}/connected`)).body, { ids: [conn.id] });
  // 2 つ目の接続を開いても、知らせは 1 回だけ
  assert.deepEqual(events, [{ type: "db_connection_state", project_id: project.id, connection_id: conn.id, connected: true }]);
  await call("DELETE", `${base}/sessions/tab1`);
  assert.equal(events.length, 1);
  assert.equal((await call("POST", `${base}/disconnect`, {})).body.disconnected, true);
  await until(() => events.length === 2);
  assert.deepEqual(events[1], { type: "db_connection_state", project_id: project.id, connection_id: conn.id, connected: false });
  assert.deepEqual((await call("GET", `${list}/connected`)).body, { ids: [] });
});

test("SQL の「AI に頼む」: テーブルと列の名前と頼みを AI に渡して SQL を返す。AI に見せない接続は断る", async () => {
  const { call, project, provider } = setup({ features: ["database"] });
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  provider.askReply = "```sql\nSELECT count(*) FROM users;\n```";
  const res = await call("POST", `${base}/sql-assist`, { path: { database: "main", schema: null }, request: "ユーザーの数", sql: "" });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { sql: "SELECT count(*) FROM users;" });
  const asked = provider.asked.at(-1);
  assert.equal(asked?.model, "standard");
  assert.match(asked?.prompt ?? "", /- users\(id, name, avatar\)/);
  assert.match(asked?.prompt ?? "", /<頼み>\nユーザーの数\n<\/頼み>/);
  // 中身の値は渡さない
  assert.doesNotMatch(asked?.prompt ?? "", /'b'|"b"/);
  await call("PATCH", base, { ai_access: "none" });
  assert.equal((await call("POST", `${base}/sql-assist`, { path: { database: "main", schema: null }, request: "x", sql: "" })).status, 400);
});

test("接続を消しても、ほかの接続の SQL のタブの途中のトランザクションはそのまま（消した接続の分を閉じるのは service.test.ts）", async () => {
  const { call, project } = setup({ features: ["database"] });
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const other = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody({ name: "ほか" }))).body as DbConnection;
  const one = (c: DbConnection) => `/api/projects/${project.id}/db-connections/${c.id}`;
  const inTransaction = async (c: DbConnection) => (await call("GET", `${one(c)}/sessions/tab1`)).body?.in_transaction ?? null;
  for (const c of [conn, other]) await call("POST", `${one(c)}/sql`, { session: "tab1", sql: "begin", write: false });
  assert.equal(await inTransaction(conn), true);
  await call("DELETE", one(conn));
  assert.deepEqual([await inTransaction(conn), await inTransaction(other)], [null, true]); // 消した接続は 404・ほかはそのまま
});

test("SQL の履歴: 利用者が流した文は成功も失敗も新しい順に残り、判定で断った文は残さない", async () => {
  const { call, project, store } = setup({ features: ["database"] });
  makeSqlite(project.repo_path);
  const c = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody({ read_only: true }))).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${c.id}`;
  await call("POST", `${base}/sql`, { session: "h", sql: "select count(*) from users", write: false });
  assert.equal((await call("POST", `${base}/sql`, { session: "h", sql: "select * from missing_table", write: false })).status, 400);
  assert.equal((await call("POST", `${base}/sql`, { session: "h", sql: "delete from users", write: false })).status, 400);
  await call("DELETE", `${base}/sessions/h`);
  const history = (await call("GET", `${base}/history`)).body as DbQueryHistoryEntry[];
  assert.deepEqual(
    history.map((h) => [h.sql, h.ran_by, h.row_count, h.error !== null, h.chat_title]),
    [
      ["select * from missing_table", "user", null, true, null],
      ["select count(*) from users", "user", 1, false, null],
    ],
  );
  assert.equal(((await call("GET", `${base}/history?limit=1`)).body as DbQueryHistoryEntry[]).length, 1);
  assert.equal((await call("GET", `${base}/history?limit=0`)).status, 400);
  // AI が流したものはチャットの名前も
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "調べもの", status: "completed" });
  store.dbQueryHistory.add({ connection_id: c.id, sql: "select 1", ran_by: "ai", chat_id: chat.id, duration_ms: 1, row_count: 1 });
  assert.deepEqual(((await call("GET", `${base}/history?limit=1`)).body as DbQueryHistoryEntry[]).map((h) => [h.ran_by, h.chat_title]), [["ai", "調べもの"]]);
});

test("SQL のタブ: 読み取り専用の接続は書く文を断り、「書き込む」の間だけ流せる", async () => {
  const { call, project } = setup({ features: ["database"] });
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody({ environment: "production", read_only: true, ai_access: "none" }))).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  assert.equal((await call("POST", `${base}/sql`, { session: "t", sql: "select 1", write: false })).status, 200);
  const denied = await call("POST", `${base}/sql`, { session: "t", sql: "delete from users", write: false });
  assert.equal(denied.status, 400);
  assert.match(denied.body.error, /読み取り専用/);
  // 1 回に流せるのは 1 つの文だけ（後ろの文を黙って捨てない）
  const two = await call("POST", `${base}/sql`, { session: "t", sql: "select 1; delete from users", write: false });
  assert.equal(two.status, 400);
  assert.match(two.body.error, /1 つの文/);
  const written = await call("POST", `${base}/sql`, { session: "t", sql: "delete from users where name = 'c'", write: true });
  assert.equal(written.status, 200);
  assert.equal((written.body as DbQueryResult).affected, 1);
});

test("DB の接続: テーブルの行の変更をまとめて保存する（1 つのトランザクション・行が合わなければすべて取り消す・読み取り専用は書き込むの間だけ・履歴）", async () => {
  const { call, project } = setup({ features: ["database"] });
  const file = makeSqlite(project.repo_path);
  const base = `/api/projects/${project.id}/db-connections`;
  const conn = (await call("POST", base, sqliteBody())).body as DbConnection;
  const url = `${base}/${conn.id}/edits`;
  const path = { database: "main", schema: null };
  const names = () => new DatabaseSync(file, { readOnly: true }).prepare("SELECT id, name FROM users ORDER BY id").all().map((r) => ({ ...r }));

  const saved = await call("POST", url, {
    path,
    table: "users",
    write: false,
    edits: [
      { kind: "update", key: { id: 1 }, values: { name: "B'2" } },
      { kind: "delete", key: { id: 3 } },
      { kind: "insert", values: { name: "d", avatar: null } },
    ],
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.affected, [1, 1, 1]);
  assert.deepEqual(names(), [
    { id: 1, name: "B'2" },
    { id: 2, name: "a" },
    // AUTOINCREMENT でない SQLite は、消した番号を使い直す
    { id: 3, name: "d" },
  ]);
  const [history] = (await call("GET", `${base}/${conn.id}/history`)).body as DbQueryHistoryEntry[];
  assert.match(history.sql, /UPDATE "main"\."users" SET "name" = 'B''2' WHERE "id" = 1;/);
  assert.equal(history.row_count, 3);

  // 2 つ目が行に当たらない（消えた行）→ 1 つ目も取り消す
  const missing = await call("POST", url, {
    path,
    table: "users",
    write: false,
    edits: [
      { kind: "update", key: { id: 2 }, values: { name: "x" } },
      { kind: "update", key: { id: 99 }, values: { name: "y" } },
    ],
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /2 番目の変更の行が見つかりません/);
  assert.equal((names()[1] as { name: string }).name, "a");
  // DB の失敗（NOT NULL）も、何番目かを添えてすべて取り消す
  const invalid = await call("POST", url, { path, table: "users", write: false, edits: [{ kind: "delete", key: { id: 2 } }, { kind: "insert", values: { name: null } }] });
  assert.match(invalid.body.error, /2 番目の変更で失敗しました/);
  assert.equal(names().length, 3);

  // 読み取り専用の接続は「書き込む」の間だけ
  await call("PATCH", `${base}/${conn.id}`, { read_only: true });
  const refused = await call("POST", url, { path, table: "users", write: false, edits: [{ kind: "delete", key: { id: 2 } }] });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /読み取り専用/);
  assert.equal((await call("POST", url, { path, table: "users", write: true, edits: [{ kind: "delete", key: { id: 2 } }] })).status, 200);
  assert.equal(names().length, 2);

  // 形の確かめ（キーのない更新・空の変更）
  assert.equal((await call("POST", url, { path, table: "users", write: true, edits: [{ kind: "update", key: {}, values: { name: "z" } }] })).status, 400);
  assert.equal((await call("POST", url, { path, table: "users", write: true, edits: [] })).status, 400);
});

