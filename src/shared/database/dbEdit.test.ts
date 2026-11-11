// テーブルの行の変更を SQL にする: 場所つきの名前・値は params・キーの NULL・変えない更新は飛ばす・既定値だけの追加・行を指す列の選び方
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbTableColumn } from "../types/database";
import { editKeyColumns, editStatements, qualifiedTable } from "./dbEdit";

const col = (name: string, patch: Partial<DbTableColumn> = {}): DbTableColumn => ({ name, type: "text", nullable: true, default: null, primary_key: false, comment: null, ...patch });

test("qualifiedTable: PostgreSQL はスキーマ、MySQL は DB、SQLite は付け足した DB の名前で。囲みの文字は 2 つに", () => {
  assert.equal(qualifiedTable("postgres", { database: "app", schema: "public" }, "users"), `"public"."users"`);
  assert.equal(qualifiedTable("mysql", { database: "shop", schema: null }, "a`b"), "`shop`.`a``b`");
  assert.equal(qualifiedTable("sqlite", { database: "main", schema: null }, 'x"y'), `"main"."x""y"`);
  assert.equal(qualifiedTable("postgres", { database: "app", schema: null }, "t"), `"t"`);
});

test("editStatements: 更新・削除・追加。値は params で、見せる文には埋める", () => {
  const path = { database: "app", schema: "public" };
  const [update, del, insert] = editStatements("postgres", path, "users", [
    { kind: "update", key: { id: 5 }, values: { name: "O'Neil", note: null } },
    { kind: "delete", key: { id: 6, active: true } },
    { kind: "insert", values: { name: "new" } },
  ]);
  assert.deepEqual(update, {
    sql: `UPDATE "public"."users" SET "name" = $1, "note" = $2 WHERE "id" = $3`,
    params: ["O'Neil", null, 5],
    expect: 1,
    preview: `UPDATE "public"."users" SET "name" = 'O''Neil', "note" = NULL WHERE "id" = 5`,
  });
  assert.deepEqual([del.sql, del.params, del.expect], [`DELETE FROM "public"."users" WHERE "id" = $1 AND "active" = $2`, [6, "true"], 1]);
  assert.deepEqual([insert.sql, insert.params, insert.expect], [`INSERT INTO "public"."users" ("name") VALUES ($1)`, ["new"], null]);
});

test("editStatements: MySQL・SQLite は ?。NULL のキーは IS NULL、真偽は 1 / 0。変える列のない更新は飛ばし、列のない追加は既定値で", () => {
  const [a] = editStatements("mysql", { database: "shop", schema: null }, "t", [{ kind: "delete", key: { code: null, flag: false } }]);
  assert.deepEqual([a.sql, a.params], ["DELETE FROM `shop`.`t` WHERE `code` IS NULL AND `flag` = ?", [0]]);
  const out = editStatements("sqlite", { database: "main", schema: null }, "t", [
    { kind: "update", key: { id: 1 }, values: {} },
    { kind: "insert", values: {} },
  ]);
  assert.deepEqual(
    out.map((s) => s.sql),
    [`INSERT INTO "main"."t" DEFAULT VALUES`],
  );
  assert.equal(editStatements("mysql", { database: null, schema: null }, "t", [{ kind: "insert", values: {} }])[0].sql, "INSERT INTO `t` () VALUES ()");
  assert.throws(() => editStatements("sqlite", { database: null, schema: null }, "t", [{ kind: "delete", key: {} }]), /キー/);
});

test("editKeyColumns: 主キー → NULL を許さない一意のインデックス → なし（ビューもなし）", () => {
  assert.deepEqual(editKeyColumns({ kind: "table", columns: [col("a", { primary_key: true }), col("b", { primary_key: true })], indexes: [] }), ["a", "b"]);
  const columns = [col("email", { nullable: false }), col("code")];
  assert.deepEqual(
    editKeyColumns({ kind: "table", columns, indexes: [{ name: "u_code", columns: ["code"], unique: true, primary: false }, { name: "u_email", columns: ["email"], unique: true, primary: false }] }),
    ["email"],
  );
  assert.equal(editKeyColumns({ kind: "table", columns, indexes: [{ name: "u_code", columns: ["code"], unique: true, primary: false }] }), null);
  assert.equal(editKeyColumns({ kind: "view", columns: [col("id", { primary_key: true })], indexes: [] }), null);
});
