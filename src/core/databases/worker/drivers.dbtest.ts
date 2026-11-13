// PostgreSQL・MySQL・MariaDB のドライバを本物の DB で確かめる（npm run test:db が Docker で DB を立てて流す。ポートの環境変数がなければ飛ばす）
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { editStatements } from "@shared/database/dbEdit";
import type { DbEngine, DbObjectPath, DbQueryResult, DbRowEdit } from "@shared/types";
import type { DbTarget, WorkerMethod, WorkerMethods } from "../protocol.js";
import { createWorkerHandler } from "./handler.js";

const password = process.env.KICKOFF_DBTEST_PASSWORD ?? "";

interface EngineCase {
  label: string;
  key: string;
  engine: DbEngine;
  user: string;
  database: string;
  sleep: string;
  terminate: string;
}

const CASES: EngineCase[] = [
  { label: "PostgreSQL", key: "PG", engine: "postgres", user: "postgres", database: "postgres", sleep: "SELECT pg_sleep(20)", terminate: "SELECT pg_terminate_backend(pg_backend_pid())" },
  { label: "MySQL", key: "MYSQL", engine: "mysql", user: "root", database: "kickoff", sleep: "SELECT SLEEP(20)", terminate: "KILL CONNECTION_ID()" },
  { label: "MariaDB", key: "MARIADB", engine: "mysql", user: "root", database: "kickoff", sleep: "SELECT SLEEP(20)", terminate: "KILL CONNECTION_ID()" },
];

/** 0〜9 の行（MySQL・MariaDB で連番を作る） */
/** 絞り込みなし */
const ALL = { filters: [], where: null };

const DIGITS = `(SELECT 0 AS n ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `UNION ALL SELECT ${n}`).join(" ")})`;
const series = (max: number) => `SELECT a.n + b.n * 10 + c.n * 100 + d.n * 1000 + 1 AS n FROM ${DIGITS} a, ${DIGITS} b, ${DIGITS} c, ${DIGITS} d WHERE a.n + b.n * 10 + c.n * 100 + d.n * 1000 + 1 <= ${max}`;

/** 確かめに使う表（users 1500 行・posts 40 行・ビュー 1 つ） */
function fixture(engine: DbEngine): string[] {
  const drop = ["DROP VIEW IF EXISTS user_posts", "DROP TABLE IF EXISTS posts", "DROP TABLE IF EXISTS users"];
  if (engine === "postgres") {
    return [
      ...drop,
      "CREATE TABLE users (id bigserial PRIMARY KEY, name text NOT NULL, email text, created_at timestamp DEFAULT '2026-01-02 03:04:05', avatar bytea, big bigint)",
      "COMMENT ON TABLE users IS '利用者'",
      "CREATE TABLE posts (id serial PRIMARY KEY, user_id bigint REFERENCES users (id) ON DELETE CASCADE, title text)",
      "CREATE INDEX posts_user ON posts (user_id)",
      "CREATE VIEW user_posts AS SELECT u.name, p.title FROM users u JOIN posts p ON p.user_id = u.id",
      "INSERT INTO users (name, email, avatar, big) SELECT 'user' || g, CASE WHEN g % 7 = 0 THEN NULL ELSE 'u' || g || '@ex.com' END, '\\x01020304'::bytea, 9007199254740993 FROM generate_series(1, 1500) g",
      "INSERT INTO posts (user_id, title) SELECT (g % 10) + 1, 'title ' || g FROM generate_series(1, 40) g",
      "ANALYZE users",
      "DROP FUNCTION IF EXISTS add_one(integer)",
      "DROP FUNCTION IF EXISTS add_one(text)",
      "DROP TYPE IF EXISTS mood",
      "CREATE FUNCTION add_one(x integer) RETURNS integer LANGUAGE sql AS $$ SELECT x + 1 $$",
      "CREATE FUNCTION add_one(x text) RETURNS text LANGUAGE sql AS $$ SELECT x || '1' $$",
      "COMMENT ON FUNCTION add_one(integer) IS '1 を足す'",
      "CREATE TYPE mood AS ENUM ('sad', 'ok', 'it''s fine')",
    ];
  }
  return [
    ...drop,
    "CREATE TABLE users (id bigint AUTO_INCREMENT PRIMARY KEY, name varchar(100) NOT NULL, email varchar(200), created_at datetime DEFAULT '2026-01-02 03:04:05', avatar blob, big bigint) COMMENT = '利用者'",
    "CREATE TABLE posts (id int AUTO_INCREMENT PRIMARY KEY, user_id bigint, title varchar(200), INDEX posts_user (user_id), CONSTRAINT posts_user_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE)",
    "CREATE VIEW user_posts AS SELECT u.name, p.title FROM users u JOIN posts p ON p.user_id = u.id",
    `INSERT INTO users (name, email, avatar, big) SELECT CONCAT('user', s.n), IF(s.n % 7 = 0, NULL, CONCAT('u', s.n, '@ex.com')), X'01020304', 9007199254740993 FROM (${series(1500)}) s ORDER BY s.n`,
    `INSERT INTO posts (user_id, title) SELECT (s.n % 10) + 1, CONCAT('title ', s.n) FROM (${series(40)}) s ORDER BY s.n`,
    "DROP FUNCTION IF EXISTS add_one",
    "DROP PROCEDURE IF EXISTS count_posts",
    "CREATE FUNCTION add_one(x INT) RETURNS INT DETERMINISTIC NO SQL COMMENT '1 を足す' RETURN x + 1",
    "CREATE PROCEDURE count_posts(IN uid BIGINT, OUT n INT) READS SQL DATA SELECT COUNT(*) INTO n FROM posts WHERE user_id = uid",
  ];
}

for (const c of CASES) {
  const port = Number(process.env[`KICKOFF_DBTEST_${c.key}_PORT`] ?? 0);
  describe(c.label, { skip: port ? false : "npm run test:db で流す" }, () => {
    const handler = createWorkerHandler();
    let nextId = 1;
    const target = (extra: Partial<DbTarget> = {}): DbTarget => ({
      engine: c.engine,
      host: "127.0.0.1",
      port,
      database: c.database,
      username: c.user,
      password,
      file: null,
      ssl: null,
      read_only: false,
      ...extra,
    });
    const path: DbObjectPath = c.engine === "postgres" ? { database: c.database, schema: "public" } : { database: c.database, schema: null };
    const call = async <M extends WorkerMethod>(method: M, params: WorkerMethods[M]["params"], id = nextId++): Promise<WorkerMethods[M]["result"]> => {
      const res = await handler.handle({ id, method, params });
      if (!res.ok) throw new Error(res.error);
      return res.result as WorkerMethods[M]["result"];
    };
    const sql = (text: string, session = "main", extra: Partial<DbTarget> = {}) => call("query", { session, target: target(extra), sql: text, max_rows: 1000 });

    before(async () => {
      // ポートが開いても初期化の途中のことがあるので、つながるまで待つ
      const end = Date.now() + 120_000;
      for (;;) {
        try {
          await call("test", { target: target() });
          break;
        } catch (e) {
          if (Date.now() > end) throw e;
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      for (const statement of fixture(c.engine)) await sql(statement, "setup");
      await call("close", { session: "setup" });
    });
    after(() => handler.closeAll());

    test("つながるか試すと版を返す", async () => {
      const { server_version } = await call("test", { target: target() });
      assert.match(server_version ?? "", c.key === "PG" ? /^PostgreSQL \d+/ : c.key === "MYSQL" ? /^MySQL \d+/ : /^MariaDB \d+/);
    });

    test("DB・テーブルとビューの一覧", async () => {
      const dbs = await call("databases", { session: "tree", target: target() });
      assert.ok(dbs.databases.includes(c.database));
      assert.equal(dbs.current, c.database);
      assert.equal(dbs.has_schemas, c.engine === "postgres");
      if (c.engine === "postgres") assert.ok((await call("schemas", { session: "tree", target: target(), database: c.database })).includes("public"));
      const objects = await call("objects", { session: "tree", target: target(), path });
      assert.deepEqual(
        // 並びは DB の照合順序による（MariaDB は users が user_posts より前）ので、名前で並べてから比べる
        objects
          .filter((o) => ["posts", "users", "user_posts"].includes(o.name))
          .sort((a, b) => (a.name < b.name ? -1 : 1))
          .map(({ kind, name }) => ({ kind, name })),
        [
          { kind: "table", name: "posts" },
          { kind: "view", name: "user_posts" },
          { kind: "table", name: "users" },
        ],
      );
      // 行数の目安は統計しだい（数か null）。ビューは null
      for (const o of objects.filter((o) => o.kind === "table" || o.kind === "view")) assert.ok(o.estimated_rows === null || typeof o.estimated_rows === "number");
      assert.equal(objects.find((o) => o.name === "user_posts")?.estimated_rows, null);
    });

    test("関数・列挙型の一覧と定義", async () => {
      const objects = await call("objects", { session: "tree", target: target(), path });
      const routines = objects.filter((o) => o.kind === "function" || o.kind === "enum");
      if (c.engine === "postgres") {
        assert.deepEqual(routines, [
          { kind: "function", name: "add_one(x integer)" },
          { kind: "function", name: "add_one(x text)" },
          { kind: "enum", name: "mood" },
        ]);
        const fn = await call("definition", { session: "tree", target: target(), path, kind: "function", name: "add_one(x integer)" });
        assert.equal(fn.arguments, "x integer");
        assert.equal(fn.returns, "integer");
        assert.equal(fn.comment, "1 を足す");
        assert.match(fn.ddl ?? "", /CREATE OR REPLACE FUNCTION public\.add_one\(x integer\)/);
        const mood = await call("definition", { session: "tree", target: target(), path, kind: "enum", name: "mood" });
        assert.deepEqual(mood.values, ["sad", "ok", "it's fine"]);
        assert.equal(mood.ddl, `CREATE TYPE "public"."mood" AS ENUM ('sad', 'ok', 'it''s fine');`);
      } else {
        assert.deepEqual(
          routines.sort((a, b) => (a.name < b.name ? -1 : 1)),
          [
            { kind: "function", name: "add_one" },
            { kind: "function", name: "count_posts" },
          ],
        );
        const fn = await call("definition", { session: "tree", target: target(), path, kind: "function", name: "add_one" });
        // MariaDB は表示の幅を付けて返す（int(11)）
        assert.match(fn.arguments ?? "", /^x int(\(\d+\))?$/);
        assert.match(fn.returns ?? "", /^int(\(\d+\))?$/);
        assert.equal(fn.comment, "1 を足す");
        assert.match(fn.ddl ?? "", /CREATE .*FUNCTION `add_one`/);
        const proc = await call("definition", { session: "tree", target: target(), path, kind: "function", name: "count_posts" });
        assert.match(proc.arguments ?? "", /^IN uid bigint(\(\d+\))?, OUT n int(\(\d+\))?$/);
        assert.equal(proc.returns, null);
        assert.match(proc.ddl ?? "", /CREATE .*PROCEDURE `count_posts`/);
      }
    });

    test("テーブルの構造・リレーション・DDL・情報", async () => {
      const users = await call("table", { session: "tree", target: target(), path, name: "users" });
      assert.equal(users.kind, "table");
      assert.deepEqual(
        users.columns.map((col) => col.name),
        ["id", "name", "email", "created_at", "avatar", "big"],
      );
      assert.equal(users.columns[0].primary_key, true);
      assert.equal(users.columns[1].nullable, false);
      assert.equal(users.columns[2].nullable, true);
      assert.ok(users.indexes.some((i) => i.primary && i.columns.join() === "id"));
      assert.equal(users.referenced_by.length, 1);
      assert.equal(users.referenced_by[0].table, "posts");
      assert.deepEqual(users.referenced_by[0].columns, ["user_id"]);
      assert.match(users.ddl ?? "", /CREATE TABLE/);
      assert.equal(users.comment, "利用者");
      assert.ok(users.estimated_rows !== null && users.estimated_rows > 0);
      assert.ok(users.size_bytes !== null && users.size_bytes > 0);
      const posts = await call("table", { session: "tree", target: target(), path, name: "posts" });
      assert.equal(posts.foreign_keys.length, 1);
      assert.equal(posts.foreign_keys[0].ref_table, "users");
      assert.deepEqual(posts.foreign_keys[0].ref_columns, ["id"]);
      assert.equal(posts.foreign_keys[0].on_delete, "CASCADE");
      assert.ok(posts.indexes.some((i) => i.name === "posts_user" && !i.unique));
      const view = await call("table", { session: "tree", target: target(), path, name: "user_posts" });
      assert.equal(view.kind, "view");
      assert.match(view.ddl ?? "", /VIEW/);
    });

    test("行（並べ替え・続き・値の形）と数", async () => {
      const page = await call("rows", { session: "tree", target: target(), path, name: "users", sort: [{ column: "id", desc: true }], offset: 0, limit: 100, filter: ALL });
      assert.equal(page.rows.length, 100);
      assert.equal(page.truncated, true);
      const names = page.columns.map((col) => col.name);
      const row = Object.fromEntries(names.map((n, i) => [n, page.rows[0][i]]));
      assert.equal(Number(row.id), 1500);
      assert.equal(row.name, "user1500");
      assert.equal(row.email, "u1500@ex.com");
      // 1498 は 7 の倍数なので email が NULL
      assert.equal(page.rows[2][names.indexOf("email")], null);
      assert.deepEqual(row.avatar, { binary: true, bytes: 4, head: "01020304" });
      assert.equal(row.big, "9007199254740993");
      assert.equal(row.created_at, "2026-01-02 03:04:05");
      const last = await call("rows", { session: "tree", target: target(), path, name: "users", sort: [], offset: 1450, limit: 100, filter: ALL });
      assert.equal(last.rows.length, 50);
      assert.equal(last.truncated, false);
      assert.equal((await call("count", { session: "tree", target: target(), path, name: "users", filter: ALL })).count, 1500);
      const outline = await call("outline", { session: "tree", target: target(), path });
      assert.deepEqual(outline.find((t) => t.name === "posts")?.columns, ["id", "user_id", "title"]);
    });

    test("行の絞り込み（値は params・含むは大文字と小文字を区別しない・NULL・WHERE の文）と、絞った数", async () => {
      const rows = (filter: { filters: { column: string; op: "eq" | "contains" | "is_null" | "ge"; value: string }[]; where: string | null }) =>
        call("rows", { session: "tree", target: target(), path, name: "users", sort: [{ column: "id", desc: false }], offset: 0, limit: 100, filter });
      const count = (filter: { filters: { column: string; op: "eq" | "contains" | "is_null" | "ge"; value: string }[]; where: string | null }) =>
        call("count", { session: "tree", target: target(), path, name: "users", filter });
      const eq = await rows({ filters: [{ column: "id", op: "eq", value: "42" }], where: null });
      assert.equal(eq.rows.length, 1);
      assert.equal(Number(eq.rows[0][0]), 42);
      const like = { filters: [{ column: "name", op: "contains" as const, value: "USER149" }], where: null };
      assert.equal((await rows(like)).rows.length, 11);
      assert.equal((await count(like)).count, 11);
      // 1500 までの 7 の倍数は 214 個
      assert.equal((await count({ filters: [{ column: "email", op: "is_null", value: "" }], where: null })).count, 214);
      assert.equal((await count({ filters: [{ column: "id", op: "ge", value: "1401" }, { column: "email", op: "is_null", value: "" }], where: null })).count, 14);
      const where = await rows({ filters: [], where: "id < 3 -- 後ろの LIMIT を消さない" });
      assert.equal(where.rows.length, 2);
      // 引用符を含む値も params なので崩れない
      assert.equal((await count({ filters: [{ column: "name", op: "eq", value: "x' OR '1'='1" }], where: null })).count, 0);
    });

    test("SQL: 上限で切り、そのあとも同じ接続で流せる", async () => {
      const r: DbQueryResult = await sql("SELECT id, name FROM users ORDER BY id");
      assert.equal(r.rows.length, 1000);
      assert.equal(r.truncated, true);
      assert.deepEqual(
        r.columns.map((col) => col.name),
        ["id", "name"],
      );
      // 「さらに読む」: 頭を飛ばして続き（流し直す）
      const next: DbQueryResult = await call("query", { session: "main", target: target(), sql: "SELECT id FROM users ORDER BY id", max_rows: 1000, skip: 1000 });
      assert.equal(Number(next.rows[0][0]), 1001);
      const tail: DbQueryResult = await call("query", { session: "main", target: target(), sql: "SELECT id FROM users ORDER BY id", max_rows: 1000, skip: 1400 });
      assert.equal(tail.truncated, false);
      // 長い文字は頭だけ
      const long: DbQueryResult = await sql(`SELECT ${c.engine === "postgres" ? "repeat('x', 20000)" : "REPEAT('x', 20000)"} AS t`);
      assert.deepEqual(long.rows[0][0], { long: true, head: "x".repeat(10_000), chars: 20_000 });
      const one = await sql("SELECT 1 AS x");
      assert.equal(Number(one.rows[0][0]), 1);
      assert.equal(one.truncated, false);
      // 列の型は SQL の型の名前で（MySQL の DECIMAL は mysql2 では NEWDECIMAL と届く）
      const typed = await sql("SELECT CAST(1.5 AS DECIMAL(10,2)) AS d, CAST('a' AS CHAR(5)) AS c");
      assert.equal(typed.columns[0].type, c.engine === "postgres" ? "numeric" : "decimal");
    });

    test("SQL: トランザクションの途中を知らせ、取り消すと戻る", async () => {
      await sql(c.engine === "postgres" ? "BEGIN" : "START TRANSACTION", "tx");
      const ins = await sql("INSERT INTO users (name) VALUES ('scratch')", "tx");
      assert.equal(ins.affected, 1);
      assert.equal(ins.in_transaction, true);
      assert.deepEqual(await call("rollback", { session: "tx" }), { in_transaction: false });
      assert.equal((await call("count", { session: "tree", target: target(), path, name: "users", filter: ALL })).count, 1500);
      // コミットも
      await sql(c.engine === "postgres" ? "BEGIN" : "START TRANSACTION", "tx");
      await sql("UPDATE users SET email = 'changed@ex.com' WHERE id = 1", "tx");
      assert.deepEqual(await call("commit", { session: "tx" }), { in_transaction: false });
      const after = await sql("SELECT email FROM users WHERE id = 1");
      assert.equal(after.rows[0][0], "changed@ex.com");
    });

    test("DB の側の時間の上限（AI の SQL）: 超えたら DB が止める", async () => {
      // MySQL の max_execution_time は SELECT だけ・SLEEP は止められても 1 を返すので、上限の値が付いたことを確かめる
      const value =
        c.key === "PG"
          ? (await sql("SHOW statement_timeout", "timeout", { timeout_ms: 1500 })).rows[0][0]
          : (await sql(c.key === "MYSQL" ? "SELECT @@SESSION.max_execution_time" : "SELECT @@SESSION.max_statement_time", "timeout", { timeout_ms: 1500 })).rows[0][0];
      // PostgreSQL は「1500ms」、MySQL はミリ秒、MariaDB は秒
      if (c.key === "PG") assert.equal(value, "1500ms");
      else assert.equal(Number(value), c.key === "MYSQL" ? 1500 : 1.5);
      if (c.key === "PG") await assert.rejects(sql("SELECT pg_sleep(5)", "timeout", { timeout_ms: 1500 }), /statement timeout/);
      await call("close", { session: "timeout" });
    });

    test("読み取り専用の接続は DB 側でも書けない", async () => {
      await assert.rejects(sql("INSERT INTO users (name) VALUES ('ro')", "ro", { read_only: true }), /read.only|READ ONLY/i);
      const read = await sql("SELECT COUNT(*) FROM users", "ro", { read_only: true });
      assert.equal(Number(read.rows[0][0]), 1500);
    });

    test("読み取り専用の接続は DB 側で DDL（表を作る・変える・消す）も通らない", async () => {
      // MySQL・MariaDB は DDL が暗黙にコミットするので、セッションの READ ONLY が DDL にも効くかを確かめる
      for (const ddl of ["CREATE TABLE ro_made (id INT)", "ALTER TABLE users ADD COLUMN ro_col INT", "DROP TABLE users", "TRUNCATE TABLE users"]) {
        await assert.rejects(sql(ddl, "ro", { read_only: true }), /read.only|READ ONLY/i, ddl);
      }
      // 何も変わっていない（表も行も列もそのまま）
      const read = await sql("SELECT COUNT(*) FROM users", "ro", { read_only: true });
      assert.equal(Number(read.rows[0][0]), 1500);
      const cols = await sql("SELECT * FROM users LIMIT 1", "ro", { read_only: true });
      assert.ok(!cols.columns.some((col) => col.name === "ro_col"));
      await assert.rejects(sql("SELECT * FROM ro_made", "ro", { read_only: true }));
    });

    test("流している文を止められる", async () => {
      const id = nextId++;
      const startedAt = Date.now();
      const running = handler.handle({ id, method: "query", params: { session: "slow", target: target(), sql: c.sleep, max_rows: 10 } });
      await new Promise((r) => setTimeout(r, 800));
      await handler.cancel(id);
      await running;
      assert.ok(Date.now() - startedAt < 8000, "20 秒待たずに止まる");
      // 止めたあとも同じ接続で流せる
      assert.equal(Number((await sql("SELECT 2", "slow")).rows[0][0]), 2);
    });

    test("AI の SQL の書き出し: 頭の行で収まればファイルを作らず、超えたらすべての行を CSV に書く。止めると書きかけを残さない", async () => {
      const dir = mkdtempSync(join(tmpdir(), "kickoff-dbtest-"));
      try {
        const few = await call("export", { session: "export", target: target(), sql: "SELECT id, name FROM users ORDER BY id LIMIT 3", file: join(dir, "few.csv"), head_rows: 100 });
        assert.equal(few.file, null);
        assert.equal(few.total_rows, 3);
        assert.equal(existsSync(join(dir, "few.csv")), false);

        const file = join(dir, "all.csv");
        const all = await call("export", { session: "export", target: target(), sql: "SELECT id, name, email, avatar FROM users ORDER BY id", file, head_rows: 100 });
        assert.equal(all.file, file);
        assert.equal(all.total_rows, 1500);
        assert.equal(all.rows.length, 100);
        const lines = readFileSync(file, "utf8").trimEnd().split("\n");
        assert.equal(lines.length, 1501);
        assert.equal(lines[0], "id,name,email,avatar");
        // 1 行目の利用者はほかのテストが書き換えるので、2 行目から見る
        assert.equal(lines[2], "2,user2,u2@ex.com,\\x01020304");
        assert.equal(lines[7], "7,user7,,\\x01020304");
        // 同じ接続で続けて流せる
        assert.equal(Number((await sql("SELECT 5", "export")).rows[0][0]), 5);

        const id = nextId++;
        const slowFile = join(dir, "slow.csv");
        const slowSql = c.engine === "postgres" ? "SELECT g, pg_sleep(0.01) FROM generate_series(1, 3000) g" : `SELECT s.n, SLEEP(0.01) FROM (${series(3000)}) s`;
        const running = handler.handle({ id, method: "export", params: { session: "export-slow", target: target(), sql: slowSql, file: slowFile, head_rows: 100 } });
        await new Promise((r) => setTimeout(r, 2500));
        await handler.cancel(id);
        const res = await running;
        assert.equal(res.ok, false);
        assert.equal(existsSync(slowFile), false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("行の変更をまとめて保存する（同じ値への更新も 1 行と数え、行が合わなければすべて取り消す）", async () => {
      await sql("DROP TABLE IF EXISTS edits_t", "edit");
      await sql(`CREATE TABLE edits_t (id integer PRIMARY KEY, name varchar(20) NOT NULL, flag ${c.engine === "postgres" ? "boolean" : "tinyint"} NOT NULL DEFAULT ${c.engine === "postgres" ? "false" : "0"})`, "edit");
      await sql("INSERT INTO edits_t (id, name) VALUES (1, 'a'), (2, 'b')", "edit");
      const apply = (edits: DbRowEdit[]) =>
        call("apply", { session: "edit", target: target(), statements: editStatements(c.engine, path, "edits_t", edits).map(({ sql: text, params, expect }) => ({ sql: text, params, expect })) });
      const done = await apply([
        { kind: "update", key: { id: 1 }, values: { name: "a" } },
        { kind: "update", key: { id: 2 }, values: { name: "B", flag: c.engine === "postgres" ? "true" : "1" } },
        { kind: "insert", values: { id: "3", name: "c" } },
      ]);
      assert.deepEqual(done.affected, [1, 1, 1]);
      await assert.rejects(
        apply([
          { kind: "delete", key: { id: 3 } },
          { kind: "update", key: { id: 9 }, values: { name: "x" } },
        ]),
        /2 番目の変更の行が見つかりません/,
      );
      const rows = (await sql("SELECT id, name FROM edits_t ORDER BY id", "edit")).rows.map((r) => [Number(r[0]), r[1]]);
      assert.deepEqual(rows, [
        [1, "a"],
        [2, "B"],
        [3, "c"],
      ]);
      await call("close", { session: "edit" });
    });

    test("DB が接続を切ったら、次の頼みでつなぎ直す", async () => {
      await sql("SELECT 1", "drop");
      await sql(c.terminate, "drop").catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(Number((await sql("SELECT 3", "drop")).rows[0][0]), 3);
    });
  });
}
