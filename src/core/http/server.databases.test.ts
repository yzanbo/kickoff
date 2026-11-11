// API のテスト: DB クライアント（接続の登録・パスワードの扱い・写す・試す・木とテーブル・SQL のタブ・読み取り専用・この Mac からだけ）
// DB ワーカーは同じプロセスで動かす（testing/testServer.ts の setup()）。本物のプロセスでの起動は databases/client.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { BusEvent, DbConnection, DbErSchema, DbImportCandidate, DbQueryHistoryEntry, DbQueryResult, DbTableDetail, NewDbConnectionBody } from "@shared/types";
import { AUTH, setup } from "../testing/testServer.js";
import { tempDir } from "../testing/tempDir.js";
import { gitRepo } from "../testing/gitRepo.js";

/** プロジェクトのフォルダに SQLite のファイルを作る（users と、users を指す posts） */
function makeSqlite(dir: string, name = "app.db") {
  const file = path.join(dir, name);
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, avatar BLOB);
    CREATE INDEX idx_users_name ON users(name);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title TEXT);
    CREATE VIEW user_names AS SELECT name FROM users;
    INSERT INTO users (name, avatar) VALUES ('b', x'0102'), ('a', NULL), ('c', NULL);
    INSERT INTO posts (user_id, title) VALUES (1, 'hello');
  `);
  db.close();
  return file;
}

const sqliteBody = (patch: Partial<NewDbConnectionBody> = {}): NewDbConnectionBody => ({
  name: "ローカルの DB",
  engine: "sqlite",
  environment: "local",
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

test("DB の接続: 作る・一覧・変える・並べ替える・消す。パスワードは保存したかだけ返し、消すと秘密の値も消える", async () => {
  const { call, project, store, bus } = setup();
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  makeSqlite(project.repo_path);

  const created = await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody());
  assert.equal(created.status, 201);
  assert.equal(created.body.has_password, false);
  const pg = (
    await call("POST", `/api/projects/${project.id}/db-connections`, {
      ...sqliteBody({ name: "本番", engine: "postgres", environment: "production", host: "db.example.com", port: 5432, database: "app", username: "u", file_path: null }),
      read_only: true,
      ai_access: "none",
      ssl: { mode: "require", ca_path: null },
      password: "s3cret",
    })
  ).body as DbConnection;
  assert.equal(pg.has_password, true);
  assert.deepEqual(pg.ssl, { mode: "require", ca_path: null });
  assert.ok(!JSON.stringify(pg).includes("s3cret"));
  assert.equal(store.dbConnections.password(pg.id), "s3cret");
  // 知らせには中身を載せない
  assert.ok(events.some((e) => e.type === "db_connections" && e.project_id === project.id));
  assert.ok(!JSON.stringify(events).includes("db.example.com"));

  const list = (await call("GET", `/api/projects/${project.id}/db-connections`)).body as DbConnection[];
  assert.deepEqual(
    list.map((c) => c.name),
    ["ローカルの DB", "本番"],
  );

  // パスワードは省けばそのまま、null で消す
  const renamed = (await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { name: "本番2" })).body as DbConnection;
  assert.equal(renamed.name, "本番2");
  assert.equal(renamed.has_password, true);
  assert.equal(((await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { password: null })).body as DbConnection).has_password, false);
  await call("PATCH", `/api/projects/${project.id}/db-connections/${pg.id}`, { password: "again" });

  const ordered = (await call("PUT", `/api/projects/${project.id}/db-connections/order`, { ids: [pg.id] })).body as DbConnection[];
  assert.deepEqual(
    ordered.map((c) => c.id),
    [pg.id, created.body.id],
  );

  assert.equal((await call("DELETE", `/api/projects/${project.id}/db-connections/${pg.id}`)).status, 204);
  assert.equal(store.dbConnections.password(pg.id), null);
  assert.equal((await call("DELETE", `/api/projects/${project.id}/db-connections/${pg.id}`)).status, 404);
});

test("DB の接続: 種類ごとに要る項目・Kickoff 自身のデータは断り、ほかのプロジェクトの接続は 404。プロジェクトを消すと秘密の値も消える", async () => {
  const { call, project, store, dbFake } = setup();
  const base = `/api/projects/${project.id}/db-connections`;
  assert.equal((await call("POST", base, sqliteBody({ file_path: null }))).status, 400);
  assert.equal((await call("POST", base, sqliteBody({ engine: "mysql", file_path: null }))).status, 400);
  // Kickoff の保存先の中（リンクを解いた実体で比べる）
  fs.writeFileSync(path.join(dbFake.dataDir, "kickoff.db"), "");
  const kickoff = await call("POST", base, sqliteBody({ file_path: path.join(dbFake.dataDir, "kickoff.db") }));
  assert.equal(kickoff.status, 400);
  assert.match(kickoff.body.error, /Kickoff 自身のデータ/);
  const link = path.join(tempDir(), "link");
  fs.symlinkSync(dbFake.dataDir, link);
  assert.equal((await call("POST", base, sqliteBody({ file_path: path.join(link, "kickoff.db") }))).status, 400);

  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const theirs = store.dbConnections.create(other.id, { ...sqliteBody(), password: "p" });
  assert.equal((await call("PATCH", `${base}/${theirs.id}`, { name: "x" })).status, 404);
  store.projects.delete(other.id);
  assert.equal(store.dbConnections.get(theirs.id), undefined);
  assert.equal(store.dbConnections.password(theirs.id), null);
});

test("DB の接続: ほかのプロジェクトから写す（パスワードは選んだときだけ）", async () => {
  const { call, project, store } = setup();
  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const from = store.dbConnections.create(other.id, { ...sqliteBody({ engine: "postgres", host: "h", file_path: null }), password: "p" });
  const without = (await call("POST", `/api/projects/${project.id}/db-connections/copy`, { from_id: from.id, copy_password: false })).body as DbConnection;
  assert.equal(without.project_id, project.id);
  assert.equal(without.host, "h");
  assert.equal(without.has_password, false);
  const withPassword = (await call("POST", `/api/projects/${project.id}/db-connections/copy`, { from_id: from.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.password(withPassword.id), "p");
});

test("DB の接続: プロジェクトから取り込む（案にパスワードは出さず、取り込むときに読み直す。登録済みの印・環境の既定・ないものは 404）", async () => {
  const { call, project, store } = setup();
  const base = `/api/projects/${project.id}/db-connections/import`;
  makeSqlite(project.repo_path);
  fs.writeFileSync(path.join(project.repo_path, ".env"), "DATABASE_URL=postgres://app:s3cret@db.example.com/shop\n");
  store.dbConnections.create(project.id, { ...sqliteBody(), password: null });

  const res = await call("GET", base);
  assert.equal(res.status, 200);
  assert.ok(!JSON.stringify(res.body).includes("s3cret"));
  const list = res.body as DbImportCandidate[];
  assert.deepEqual(
    list.map((c) => [c.key, c.engine, c.environment, c.has_password, c.existing_id !== null]),
    [
      ["env:.env:DATABASE_URL", "postgres", "production", true, false],
      ["file:app.db", "sqlite", "local", false, true],
    ],
  );

  const created = await call("POST", base, { items: [{ key: "env:.env:DATABASE_URL", name: "店の DB", environment: "staging" }] });
  assert.equal(created.status, 201);
  const [conn] = created.body as DbConnection[];
  assert.equal(conn.name, "店の DB");
  assert.equal(conn.host, "db.example.com");
  assert.equal(conn.environment, "staging");
  assert.equal(conn.ai_access, "ask");
  assert.equal(conn.read_only, false);
  assert.equal(conn.has_password, true);
  assert.ok(!JSON.stringify(created.body).includes("s3cret"));
  assert.equal(store.dbConnections.password(conn.id), "s3cret");
  assert.equal(((await call("GET", base)).body as DbImportCandidate[])[0].existing_id, conn.id);

  assert.equal((await call("POST", base, { items: [{ key: "env:.env:NOPE", name: "x", environment: "local" }] })).status, 404);
  assert.equal((await call("POST", base, { items: [] })).status, 400);
});

test("DB の接続: 手順メモ（メモのフォルダからの相対パス。外を指すものは断り、メモの名前の変更・フォルダの移動で付け替え、写すときは外す）", async () => {
  const { call, project, store } = setup();
  const base = `/api/projects/${project.id}/db-connections`;
  makeSqlite(project.repo_path);
  assert.equal((await call("POST", base, { ...sqliteBody(), memo_path: "../x.md" })).status, 400);
  assert.equal((await call("POST", base, { ...sqliteBody(), memo_path: "/etc/x.md" })).status, 400);
  const a = (await call("POST", base, { ...sqliteBody(), memo_path: "DB/ローカル.md" })).body as DbConnection;
  const b = (await call("POST", base, { ...sqliteBody({ name: "2 つ目" }), memo_path: "DB/ローカル.md" })).body as DbConnection;
  const other = (await call("POST", base, { ...sqliteBody({ name: "別" }), memo_path: "DB/ローカル.md.bak" })).body as DbConnection;
  assert.equal(a.memo_path, "DB/ローカル.md");

  assert.equal((await call("POST", `/api/projects/${project.id}/memos`, { path: "DB/ローカル.md", content: "# x" })).status, 201);
  assert.equal((await call("POST", `/api/projects/${project.id}/memos/move`, { from: "DB/ローカル.md", to: "DB/Docker.md" })).status, 200);
  assert.deepEqual([a, b, other].map((c) => store.dbConnections.get(c.id)!.memo_path), ["DB/Docker.md", "DB/Docker.md", "DB/ローカル.md.bak"]);
  assert.equal((await call("POST", `/api/projects/${project.id}/memos/move`, { from: "DB", to: "接続" })).status, 200);
  assert.equal(store.dbConnections.get(a.id)!.memo_path, "接続/Docker.md");

  const cleared = (await call("PATCH", `${base}/${a.id}`, { memo_path: null })).body as DbConnection;
  assert.equal(cleared.memo_path, null);
  const otherProject = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  const copied = (await call("POST", `/api/projects/${otherProject.id}/db-connections/copy`, { from_id: b.id, copy_password: false })).body as DbConnection;
  assert.equal(copied.memo_path, null);
});

test("DB の接続: AI 用のユーザーとパスワード（パスワードは保存したかだけ返す・写すのは選んだときだけ・消すと秘密の値も消える）", async () => {
  const { call, project, store } = setup();
  const base = `/api/projects/${project.id}/db-connections`;
  const body = { ...sqliteBody({ engine: "postgres", host: "h", file_path: null }), ai_username: "ai_reader", ai_password: "ai-s3cret" };
  const created = (await call("POST", base, body)).body as DbConnection;
  assert.equal(created.ai_username, "ai_reader");
  assert.equal(created.has_ai_password, true);
  assert.equal(created.has_password, false);
  assert.ok(!JSON.stringify(created).includes("ai-s3cret"));
  assert.equal(store.dbConnections.aiPassword(created.id), "ai-s3cret");
  // 省けばそのまま、null で消す
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { name: "x" })).body as DbConnection).has_ai_password, true);
  assert.equal(((await call("PATCH", `${base}/${created.id}`, { ai_password: null })).body as DbConnection).has_ai_password, false);
  await call("PATCH", `${base}/${created.id}`, { ai_password: "again" });
  // 空のユーザーは「ない」（null）
  assert.equal(((await call("POST", base, { ...body, name: "空", ai_username: " " })).body as DbConnection).ai_username, null);

  const other = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: false })).body as DbConnection;
  assert.equal(other.ai_username, "ai_reader");
  assert.equal(other.has_ai_password, false);
  const copied = (await call("POST", `${base}/copy`, { from_id: created.id, copy_password: true })).body as DbConnection;
  assert.equal(store.dbConnections.aiPassword(copied.id), "again");

  await call("DELETE", `${base}/${created.id}`);
  assert.equal(store.dbConnections.aiPassword(created.id), null);
});

test("DB の接続: つながるか試す（保存しない）。ないファイルは失敗を返す", async () => {
  const { call, project } = setup();
  makeSqlite(project.repo_path);
  const base = `/api/projects/${project.id}/db-connections`;
  const ok = (await call("POST", `${base}/test`, { ...sqliteBody(), name: undefined })).body;
  assert.equal(ok.ok, true);
  assert.match(ok.server_version, /^SQLite \d/);
  const missing = (await call("POST", `${base}/test`, sqliteBody({ file_path: "none.db" }))).body;
  assert.equal(missing.ok, false);
  assert.match(missing.error, /見つかりません/);
  // まだ対応していない種類も失敗の文で返す
  assert.equal((await call("POST", `${base}/test`, sqliteBody({ engine: "postgres", host: "127.0.0.1", file_path: null }))).body.ok, false);
  assert.equal(fs.existsSync(path.join(project.repo_path, "none.db")), false);
});

test("DB の木とテーブル: DB・テーブルとビュー・構造・行（並べ替え・続き）・数・補完の名前", async () => {
  const { call, project } = setup();
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const main = { database: "main", schema: null };

  assert.deepEqual((await call("GET", `${base}/databases`)).body, { databases: ["main"], current: "main", has_schemas: false });
  assert.deepEqual((await call("POST", `${base}/objects`, { path: main })).body, [
    { kind: "table", name: "posts" },
    { kind: "view", name: "user_names" },
    { kind: "table", name: "users" },
  ]);

  const users = (await call("POST", `${base}/table`, { path: main, name: "users" })).body as DbTableDetail;
  assert.deepEqual(
    users.columns.map((c) => [c.name, c.type, c.primary_key, c.nullable]),
    [
      ["id", "INTEGER", true, false],
      ["name", "TEXT", false, false],
      ["avatar", "BLOB", false, true],
    ],
  );
  assert.deepEqual(
    users.indexes.map((i) => [i.name, i.columns]),
    [["idx_users_name", ["name"]]],
  );
  assert.equal(users.referenced_by[0].table, "posts");
  assert.match(users.ddl!, /CREATE TABLE users/);
  const posts = (await call("POST", `${base}/table`, { path: main, name: "posts" })).body as DbTableDetail;
  assert.deepEqual(posts.foreign_keys[0].ref_table, "users");
  assert.equal(posts.foreign_keys[0].on_delete, "CASCADE");

  const sorted = (await call("POST", `${base}/rows`, { path: main, table: "users", sort: [{ column: "name", desc: false }], offset: 0 })).body as DbQueryResult;
  assert.deepEqual(
    sorted.rows.map((r) => r[1]),
    ["a", "b", "c"],
  );
  assert.equal(sorted.truncated, false);
  // バイナリは大きさと頭だけ
  assert.deepEqual(sorted.rows[1][2], { binary: true, bytes: 2, head: "0102" });
  const page = (await call("POST", `${base}/rows`, { path: main, table: "users", sort: [], offset: 2 })).body as DbQueryResult;
  assert.equal(page.rows.length, 1);

  assert.deepEqual((await call("POST", `${base}/count`, { path: main, name: "users" })).body, { count: 3 });
  // 絞り込み（条件は AND・値は params・WHERE の文は式だけ）と、絞った数
  const filtered = (f: object) => call("POST", `${base}/rows`, { path: main, table: "users", sort: [{ column: "id", desc: false }], offset: 0, filter: f });
  const byName = { filters: [{ column: "name", op: "contains", value: "B" }], where: null };
  assert.deepEqual(((await filtered(byName)).body as DbQueryResult).rows.map((r) => r[1]), ["b"]);
  assert.deepEqual((await call("POST", `${base}/count`, { path: main, name: "users", filter: byName })).body, { count: 1 });
  const nulls = { filters: [{ column: "avatar", op: "is_null", value: "" }, { column: "id", op: "ge", value: "3" }], where: null };
  assert.deepEqual(((await filtered(nulls)).body as DbQueryResult).rows.map((r) => r[1]), ["c"]);
  assert.deepEqual(((await filtered({ filters: [], where: "name <> 'a' -- コメント" })).body as DbQueryResult).rows.map((r) => r[1]), ["b", "c"]);
  const twoStatements = await filtered({ filters: [], where: "1 = 1; delete from users" });
  assert.equal(twoStatements.status, 400);
  assert.match(twoStatements.body.error, /WHERE には式だけ/);
  assert.equal((await filtered({ filters: [{ column: "name", op: "like", value: "a" }], where: null })).status, 400);
  assert.equal(((await filtered({ filters: [], where: "no_such_column = 1" })).status), 400);
  const outline = (await call("POST", `${base}/outline`, { path: main })).body;
  assert.deepEqual(outline.find((t: { name: string }) => t.name === "posts").columns, ["id", "user_id", "title"]);
  // つないだ時刻を残す
  assert.ok((await call("GET", `/api/projects/${project.id}/db-connections`)).body[0].last_connected_at);
  // 関数・列挙型の定義: SQLite にはないので失敗を返し、種類の違うものは 400
  const definition = await call("POST", `${base}/definition`, { path: main, kind: "function", name: "f" });
  assert.equal(definition.status, 400);
  assert.match(definition.body.error, /SQLite には関数・列挙型がありません/);
  assert.equal((await call("POST", `${base}/definition`, { path: main, kind: "table", name: "users" })).status, 400);
});

test("ER 図: テーブル・ビューの構造（一意の組・外部キー）と、選んだものだけ。動かした位置は接続と場所ごとに覚えて消せる", async () => {
  const { call, project, store } = setup();
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const main = { database: "main", schema: null };

  const all = (await call("POST", `${base}/er`, { path: main, names: null })).body as DbErSchema;
  assert.deepEqual(all.names, ["posts", "user_names", "users"]);
  const posts = all.tables.find((t) => t.name === "posts")!;
  assert.deepEqual(posts.foreign_keys.map((f) => [f.columns, f.ref_table]), [[["user_id"], "users"]]);
  assert.deepEqual(posts.unique_sets, [["id"]]);
  assert.deepEqual(posts.columns[1], { name: "user_id", type: "INTEGER", nullable: true, primary_key: false });
  assert.equal(all.tables.find((t) => t.name === "user_names")!.kind, "view");

  // 選んだもの（ないものは飛ばす）
  const picked = (await call("POST", `${base}/er`, { path: main, names: ["users", "missing"] })).body as DbErSchema;
  assert.deepEqual(picked.tables.map((t) => t.name), ["users"]);
  assert.equal(picked.names.length, 3);

  const layout = `${base}/er-layout`;
  assert.deepEqual((await call("GET", `${layout}?place=main`)).body, {});
  assert.equal((await call("PUT", layout, { place: "main", positions: { users: { x: 10, y: 20.5 } } })).status, 204);
  assert.equal((await call("PUT", layout, { place: "other", positions: { posts: { x: 0, y: 0 } } })).status, 204);
  assert.deepEqual((await call("GET", `${layout}?place=main`)).body, { users: { x: 10, y: 20.5 } });
  assert.equal((await call("PUT", layout, { place: "main", positions: { users: { x: "a", y: 0 } } })).status, 400);
  assert.equal((await call("GET", layout)).status, 400);
  assert.equal((await call("DELETE", `${layout}?place=main`)).status, 204);
  assert.deepEqual((await call("GET", `${layout}?place=main`)).body, {});
  assert.deepEqual(store.dbErLayouts.get(conn.id, "other"), { posts: { x: 0, y: 0 } });
  // 接続を消すと位置も消える
  await call("DELETE", base);
  assert.deepEqual(store.dbErLayouts.get(conn.id, "other"), {});
});

test("SQL のタブ: 文を流す・トランザクションの途中の印・コミットと取り消し・閉じると取り消す", async () => {
  const { call, project } = setup();
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

test("SQL の履歴: 利用者が流した文は成功も失敗も新しい順に残り、判定で断った文は残さない", async () => {
  const { call, project, store } = setup();
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
  const { call, project } = setup();
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

test("SQLite のファイルはワークツリーではその中の同じパスを開き、なければ code 付きの 404", async () => {
  const { call, project } = setup();
  gitRepo({ dir: project.repo_path, files: { "README.md": "x" } });
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const wt = await call("POST", `/api/projects/${project.id}/git/worktrees`, { branch: "feature/db" });
  assert.equal(wt.status, 201, JSON.stringify(wt.body));
  const wtPath = (wt.body as { path: string; main: boolean }[]).find((w) => !w.main)!.path;
  const worktree = encodeURIComponent(wtPath);
  const missing = await call("GET", `/api/projects/${project.id}/db-connections/${conn.id}/databases?worktree=${worktree}`);
  assert.equal(missing.status, 404, JSON.stringify(missing.body));
  assert.equal(missing.body.code, "db_file_not_in_worktree");
  makeSqlite(wtPath);
  assert.equal((await call("GET", `/api/projects/${project.id}/db-connections/${conn.id}/databases?worktree=${worktree}`)).status, 200);
});

test("DB クライアントの API は、この Mac 以外からの頼みを 403 で断る", async () => {
  const { app, project } = setup();
  const lan = { incoming: { socket: { remoteAddress: "192.168.1.20" } } };
  const local = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };
  assert.equal((await app.request(`/api/projects/${project.id}/db-connections`, { headers: AUTH }, lan)).status, 403);
  assert.equal((await app.request(`/api/projects/${project.id}/db-connections/1/databases`, { headers: AUTH }, lan)).status, 403);
  assert.equal((await app.request(`/api/projects/${project.id}/db-connections`, { headers: AUTH }, local)).status, 200);
  // ほかの API は LAN からも使える
  assert.equal((await app.request(`/api/projects/${project.id}`, { headers: AUTH }, lan)).status, 200);
});
