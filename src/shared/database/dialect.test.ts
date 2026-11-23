import assert from "node:assert/strict";
import { test } from "vitest";
import { DB_DIALECTS, qualifiedTable, quoteIdent } from "./dialect";
import { DB_DEFAULT_PORTS } from "./types";

test("quoteIdent: SQLite・PostgreSQL は \"…\"、MySQL は `…`（中の囲みの文字は 2 つ）", () => {
  assert.equal(quoteIdent("sqlite", 'a"b'), '"a""b"');
  assert.equal(quoteIdent("postgres", 'a"b'), '"a""b"');
  assert.equal(quoteIdent("mysql", "a`b"), "`a``b`");
  assert.equal(quoteIdent("mysql", 'a"b'), '`a"b`');
});

test("literal・placeholder・like・useDatabase・insertDefaults", () => {
  for (const d of Object.values(DB_DIALECTS)) assert.equal(d.literal("it's"), "'it''s'");
  assert.equal(DB_DIALECTS.postgres.placeholder(2), "$2");
  assert.equal(DB_DIALECTS.mysql.placeholder(2), "?");
  assert.equal(DB_DIALECTS.sqlite.placeholder(2), "?");
  assert.equal(DB_DIALECTS.postgres.like('"c"', true, "$1"), `CAST("c" AS text) NOT ILIKE $1 ESCAPE '!'`);
  assert.equal(DB_DIALECTS.mysql.like("`c`", false, "?"), "`c` LIKE ? ESCAPE '!'");
  assert.equal(DB_DIALECTS.mysql.useDatabase?.("a`b"), "USE `a``b`");
  assert.equal(DB_DIALECTS.postgres.useDatabase, null);
  assert.equal(DB_DIALECTS.mysql.insertDefaults("`t`"), "INSERT INTO `t` () VALUES ()");
  assert.equal(DB_DIALECTS.sqlite.insertDefaults('"t"'), 'INSERT INTO "t" DEFAULT VALUES');
  assert.equal(DB_DIALECTS.postgres.boolParam(true), "true");
  assert.equal(DB_DIALECTS.mysql.boolParam(false), 0);
});

test("qualifiedTable: PostgreSQL はスキーマ、MySQL・SQLite は DB の名前で修飾する（なければ名前だけ）", () => {
  assert.equal(qualifiedTable("postgres", { database: "app", schema: "public" }, "users"), '"public"."users"');
  assert.equal(qualifiedTable("mysql", { database: "app", schema: "app" }, "users"), "`app`.`users`");
  assert.equal(qualifiedTable("sqlite", { database: "aux", schema: null }, "t"), '"aux"."t"');
  assert.equal(qualifiedTable("sqlite", { database: null, schema: null }, "t"), '"t"');
  assert.equal(qualifiedTable("mysql", { database: "shop", schema: null }, "a`b"), "`shop`.`a``b`");
  assert.equal(qualifiedTable("sqlite", { database: "main", schema: null }, 'x"y'), `"main"."x""y"`);
  assert.equal(qualifiedTable("postgres", { database: "app", schema: null }, "t"), `"t"`);
});

test("既定のポートと止め方は表から（SQLite はポートなし・ワーカーごと止める）", () => {
  assert.deepEqual(DB_DEFAULT_PORTS, { sqlite: null, postgres: 5432, mysql: 3306 });
  assert.equal(DB_DIALECTS.sqlite.cancel, "kill_worker");
  assert.equal(DB_DIALECTS.postgres.cancel, "side_connection");
});
