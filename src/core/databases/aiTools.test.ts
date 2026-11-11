// チャットの AI の DB のツール（kickoff_db の中身）: 見せる接続だけ・承認・読み取りの 1 文だけ・DB 側の読み取り専用・呼び出しごとの接続・履歴
import assert from "node:assert/strict";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { NewDbConnectionBody } from "@shared/types";
import { setup } from "../testing/testServer.js";
import { DbWorkerClient, inProcessWorker } from "./client.js";
import type { DbTarget } from "./protocol.js";
import { DatabaseService } from "./service.js";
import { createDbAiTools, hasAiConnections, type DbAiApprove } from "./aiTools.js";

const sqliteBody = (patch: Partial<NewDbConnectionBody> = {}): NewDbConnectionBody => ({
  name: "開発",
  engine: "sqlite",
  environment: "dev",
  host: null,
  port: null,
  database: null,
  username: null,
  file_path: "app.db",
  ssl: null,
  read_only: false,
  ai_access: "allow",
  ...patch,
});

function prepare() {
  const ctx = setup();
  const db = new DatabaseSync(path.join(ctx.project.repo_path, "app.db"));
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT);
    INSERT INTO users (name) VALUES ('a'), ('b');
  `);
  db.close();
  const chat = ctx.store.chats.create({ project_id: ctx.project.id, provider: "claude", title: "c", status: "completed" });
  const tools = createDbAiTools({ store: ctx.store, databases: ctx.databases }, { project: ctx.project, workdir: null, chatId: chat.id });
  return { ...ctx, tools };
}

const allow: DbAiApprove = async () => null;

test("AI の DB のツール: 見せない接続は一覧に出さず名前でも使えない。1 つだけなら名前を省ける", async () => {
  const { store, project, tools } = prepare();
  assert.equal(hasAiConnections(store, project.id), false);
  store.dbConnections.create(project.id, sqliteBody({ name: "本番", ai_access: "none" }));
  assert.equal(hasAiConnections(store, project.id), false);
  assert.match(tools.connections(), /AI に見せる DB の接続がありません/);
  await assert.rejects(tools.objects({ connection: "本番" }), /AI に見せる接続はありません/);

  store.dbConnections.create(project.id, sqliteBody());
  assert.equal(hasAiConnections(store, project.id), true);
  const list = tools.connections();
  assert.match(list, /開発/);
  assert.ok(!list.includes("本番") && !list.includes("app.db"));
  const objects = await tools.objects({ search: "user" });
  assert.match(objects, /- users（table）/);
  assert.ok(!objects.includes("posts"));
  const described = await tools.describe({ table: "posts" });
  assert.match(described, /- user_id INTEGER/);
  assert.match(described, /\(user_id\) → users\(id\)/);
});

test("AI の DB のツール: つなぐときにコマンドを流す接続は使わない（準備だけの接続は使える）", async () => {
  const { store, project, tools } = prepare();
  const prep = { prepare: [], cleanup: [], tunnel: null, password: null, my_ip_url: null };
  store.dbConnections.create(project.id, sqliteBody({ name: "準備だけ", prep: { ...prep, prepare: ["echo hi"] } }));
  store.dbConnections.create(project.id, sqliteBody({ name: "ステージング", engine: "postgres", file_path: null, host: "db", prep: { ...prep, password: "op read x" } }));
  await assert.rejects(tools.objects({ connection: "ステージング" }), /つなぐときにコマンドを流す接続なので、AI からは使えません/);
  assert.match(await tools.objects({ connection: "準備だけ" }), /- users（table）/);
});

test("AI の DB のツール: 読み取りの 1 文だけ流し、結果をデータの印で包む。履歴に AI の印で残る", async () => {
  const { store, project, tools } = prepare();
  const c = store.dbConnections.create(project.id, sqliteBody());
  const text = await tools.query({ sql: "select id, name from users order by id" }, allow);
  assert.match(text, /<db_data>\nid\tname\n1\ta\n2\tb\n<\/db_data>/);
  await assert.rejects(tools.query({ sql: "delete from users" }, allow), /読み取りの文/);
  await assert.rejects(tools.query({ sql: "select 1; select 2" }, allow), /1 つの文だけ/);
  await assert.rejects(tools.query({ sql: "select * from missing_table" }, allow), /no such table/);
  const history = store.dbQueryHistory.list(c.id, 10);
  assert.deepEqual(
    history.map((h) => [h.sql, h.ran_by, h.row_count, h.error !== null]),
    [
      ["select * from missing_table", "ai", null, true],
      ["select id, name from users order by id", "ai", 2, false],
    ],
  );
  // 判定で断った文は流さないので、履歴にも残らない
  assert.equal(history.length, 2);
});

test("AI の DB のツール: 読み取り専用でない接続でも DB 側は読み取り専用で、呼び出しごとに新しい接続を開いて閉じる。AI 用のユーザーがあればそれでつなぐ", async () => {
  const { store, project, dbFake } = prepare();
  const client = new DbWorkerClient(inProcessWorker);
  const calls: { method: string; session?: string; target?: DbTarget }[] = [];
  const request = client.request.bind(client);
  client.request = ((method: string, params: { session?: string; target?: DbTarget }, opts?: unknown) => {
    calls.push({ method, session: params.session, target: params.target });
    return request(method as never, params as never, opts as never);
  }) as typeof client.request;
  const databases = new DatabaseService({ store, client, dataDir: dbFake.dataDir });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const tools = createDbAiTools({ store, databases }, { project, workdir: null, chatId: chat.id });
  const c = store.dbConnections.create(project.id, { ...sqliteBody({ read_only: false }), password: "p", ai_username: "reader", ai_password: "ai-p" });
  await tools.query({ sql: "select 1" }, allow);
  await tools.query({ sql: "select 2" }, allow);
  const queries = calls.filter((x) => x.method === "query");
  assert.equal(queries.length, 2);
  for (const q of queries) {
    assert.equal(q.target?.read_only, true);
    assert.equal(q.target?.username, "reader");
    assert.equal(q.target?.password, "ai-p");
    assert.match(q.session ?? "", new RegExp(`^ai:${c.id}:`));
  }
  assert.notEqual(queries[0].session, queries[1].session);
  assert.deepEqual(
    calls.filter((x) => x.method === "close").map((x) => x.session),
    queries.map((q) => q.session),
  );
  client.stop();
});

test("AI の DB のツール: 承認して見せる接続は、流す前に聞き、断られたら流さない（流せない文は聞かない）", async () => {
  const { store, project, tools } = prepare();
  const c = store.dbConnections.create(project.id, sqliteBody({ ai_access: "ask" }));
  const asked: { connection: string; sql: string }[] = [];
  const deny: DbAiApprove = async (r) => {
    asked.push(r);
    return "利用者が断りました";
  };
  await assert.rejects(tools.query({ connection: "開発", sql: "select 1" }, deny), /利用者が断りました/);
  assert.deepEqual(asked, [{ connection: "開発", sql: "select 1" }]);
  await assert.rejects(tools.query({ sql: "drop table users" }, deny), /読み取りの文/);
  assert.equal(asked.length, 1);
  assert.equal(store.dbQueryHistory.list(c.id, 10).length, 0);
  assert.match(await tools.query({ sql: "select 1 as one" }, allow), /one\n1/);
  // 一覧・構造は聞かずに読める
  assert.match(await tools.objects({}), /users/);
});
