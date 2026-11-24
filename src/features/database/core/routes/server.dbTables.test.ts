// API のテスト: DB の木とテーブル（構造・行・1 行の読み直し・ER 図・ワークツリーの SQLite）
// DB ワーカーは同じプロセスで動かす（testing/testServer.ts の setup({ features: ["database"] })）。本物のプロセスでの起動は core/workerClient.test.ts
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { DB_VALUE_HEAD_CHARS, type DbConnection, type DbErSchema, type DbQueryResult, type DbTableDetail } from "@shared/database/types";
import type { DbFullRow } from "@shared/database/api";
import { setup } from "@/app/core/testing/testServer";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { quietShell } from "@/foundation/core/testing/quietShell";
import { makeSqlite, sqliteBody } from "@/features/database/core/testing";

quietShell();

test("DB の木とテーブル: DB・テーブルとビュー・構造・行（並べ替え・続き）・数・補完の名前", async () => {
  const { call, project } = setup({ features: ["database"] });
  const file = makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const main = { database: "main", schema: null };

  assert.deepEqual((await call("GET", `${base}/databases`)).body, { databases: ["main"], current: "main", has_schemas: false });
  assert.deepEqual((await call("POST", `${base}/objects`, { path: main })).body, [
    { kind: "table", name: "posts", estimated_rows: null },
    { kind: "view", name: "user_names", estimated_rows: null },
    { kind: "table", name: "users", estimated_rows: null },
  ]);
  // ANALYZE の統計があれば、テーブルの行数の目安を返す（ビューは null のまま）
  const analyzed = new DatabaseSync(file);
  analyzed.exec("ANALYZE");
  analyzed.close();
  assert.deepEqual(
    ((await call("POST", `${base}/objects`, { path: main })).body as { name: string; estimated_rows: number | null }[]).map((o) => [o.name, o.estimated_rows]),
    [
      ["posts", 1],
      ["user_names", null],
      ["users", 3],
    ],
  );

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

test("テーブルの行: 長い文字は頭だけ返し、行を指す条件で 1 行を全体のまま読み直せる（当たらなければ 404）", async () => {
  const { call, project } = setup({ features: ["database"] });
  const file = makeSqlite(project.repo_path);
  const long = "あ".repeat(DB_VALUE_HEAD_CHARS + 5);
  const db = new DatabaseSync(file);
  db.prepare("UPDATE users SET name = ? WHERE id = 1").run(long);
  db.close();
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const base = `/api/projects/${project.id}/db-connections/${conn.id}`;
  const main = { database: "main", schema: null };

  const rows = (await call("POST", `${base}/rows`, { path: main, table: "users", sort: [{ column: "id", desc: false }], offset: 0 })).body as DbQueryResult;
  assert.deepEqual(rows.rows[0][1], { long: true, head: long.slice(0, DB_VALUE_HEAD_CHARS), chars: long.length });
  assert.equal(rows.rows[1][1], "a");
  const full = await call("POST", `${base}/full-row`, { path: main, table: "users", filters: [{ column: "id", op: "eq", value: "1" }] });
  assert.equal(full.status, 200);
  assert.deepEqual((full.body as DbFullRow).columns.map((c) => c.name), ["id", "name", "avatar"]);
  assert.equal((full.body as DbFullRow).row[1], long);
  assert.equal((await call("POST", `${base}/full-row`, { path: main, table: "users", filters: [{ column: "id", op: "eq", value: "99" }] })).status, 404);
  assert.equal((await call("POST", `${base}/full-row`, { path: main, table: "users", filters: [] })).status, 400);
  // SQL のタブも頭だけ
  const sql = (await call("POST", `${base}/sql`, { sql: "SELECT name FROM users WHERE id = 1", session: "t1", write: false })).body as DbQueryResult;
  assert.equal((sql.rows[0][0] as { chars: number }).chars, long.length);
});

test("ER 図: テーブル・ビューの構造（一意の組・外部キー）と、選んだものだけ。動かした位置は接続と場所ごとに覚えて消せる", async () => {
  const { call, project, store } = setup({ features: ["database"] });
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
  assert.deepEqual((await call("GET", `${layout}?scope=main`)).body, {});
  assert.equal((await call("PUT", layout, { scope: "main", positions: { users: { x: 10, y: 20.5 } } })).status, 204);
  assert.equal((await call("PUT", layout, { scope: "other", positions: { posts: { x: 0, y: 0 } } })).status, 204);
  assert.deepEqual((await call("GET", `${layout}?scope=main`)).body, { users: { x: 10, y: 20.5 } });
  assert.equal((await call("PUT", layout, { scope: "main", positions: { users: { x: "a", y: 0 } } })).status, 400);
  assert.equal((await call("GET", layout)).status, 400);
  assert.equal((await call("DELETE", `${layout}?scope=main`)).status, 204);
  assert.deepEqual((await call("GET", `${layout}?scope=main`)).body, {});
  assert.deepEqual(store.dbErLayouts.get(conn.id, "other"), { posts: { x: 0, y: 0 } });
  // 接続を消すと位置も消える
  await call("DELETE", base);
  assert.deepEqual(store.dbErLayouts.get(conn.id, "other"), {});
});

test("SQLite のファイルはワークツリーではその中の同じパスを開き、なければ code 付きの 404", async () => {
  const { call, api, project } = setup({ features: ["database"] });
  gitRepo({ dir: project.repo_path, files: { "README.md": "x" } });
  makeSqlite(project.repo_path);
  const conn = (await call("POST", `/api/projects/${project.id}/db-connections`, sqliteBody())).body as DbConnection;
  const wt = await api("POST /api/projects/:projectId/git/worktrees", { params: { projectId: project.id }, body: { branch: "feature/db" } });
  assert.equal(wt.status, 201, JSON.stringify(wt.body));
  const wtPath = (wt.body as { path: string; main: boolean }[]).find((w) => !w.main)!.path;
  const worktree = encodeURIComponent(wtPath);
  const missing = await call("GET", `/api/projects/${project.id}/db-connections/${conn.id}/databases?worktree=${worktree}`);
  assert.equal(missing.status, 404, JSON.stringify(missing.body));
  assert.equal(missing.body.code, "db_file_not_in_worktree");
  makeSqlite(wtPath);
  assert.equal((await call("GET", `/api/projects/${project.id}/db-connections/${conn.id}/databases?worktree=${worktree}`)).status, 200);
});

