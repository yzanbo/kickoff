import assert from "node:assert/strict";
import { test } from "node:test";
import type { DbErTable, DbForeignKey, DbTableDetail } from "../types";
import { erMermaid, erNeighborhood, erRelations, erTableOf } from "./erDiagram";

const col = (name: string, opts: { pk?: boolean; nullable?: boolean; type?: string } = {}) => ({
  name,
  type: opts.type ?? "integer",
  nullable: opts.nullable ?? false,
  primary_key: opts.pk ?? false,
});
const fk = (columns: string[], ref_table: string, ref_columns = ["id"]): DbForeignKey => ({
  name: null,
  columns,
  ref_schema: null,
  ref_table,
  ref_columns,
  on_update: null,
  on_delete: null,
});
const table = (name: string, columns: DbErTable["columns"], foreign_keys: DbForeignKey[] = [], unique_sets?: string[][]): DbErTable => ({
  name,
  kind: "table",
  comment: null,
  columns,
  foreign_keys,
  unique_sets: unique_sets ?? [columns.filter((c) => c.primary_key).map((c) => c.name)],
});

test("erTableOf: 主キーと一意のインデックスを一意の組にし、列は名前・型・NULL・主キーだけ", () => {
  const detail: DbTableDetail = {
    kind: "table",
    columns: [
      { ...col("id", { pk: true }), default: null, comment: null },
      { ...col("email", { type: "text" }), default: null, comment: null },
    ],
    indexes: [
      { name: "pk", columns: ["id"], unique: true, primary: true },
      { name: "email_key", columns: ["email"], unique: true, primary: false },
      { name: "plain", columns: ["email"], unique: false, primary: false },
    ],
    foreign_keys: [],
    referenced_by: [],
    triggers: [],
    ddl: null,
    estimated_rows: null,
    size_bytes: null,
    comment: "利用者",
  };
  const t = erTableOf("users", detail);
  assert.deepEqual(t.unique_sets, [["id"], ["email"]]);
  assert.deepEqual(t.columns[1], { name: "email", type: "text", nullable: false, primary_key: false });
  assert.equal(t.comment, "利用者");
});

test("erRelations: 外部キーの多さ（一意なら 1 対 1、NULL を許せば親は 0 か 1）。図にないテーブルを指すものは出さない", () => {
  const users = table("users", [col("id", { pk: true })]);
  const profiles = table("profiles", [col("id", { pk: true }), col("user_id")], [fk(["user_id"], "users")], [["id"], ["user_id"]]);
  const posts = table("posts", [col("id", { pk: true }), col("author_id", { nullable: true }), col("org_id")], [fk(["author_id"], "users"), fk(["org_id"], "orgs")]);
  const rels = erRelations([users, profiles, posts], { inferred: false });
  assert.equal(rels.length, 2);
  assert.deepEqual(
    rels.map((r) => [r.from, r.to, r.cardinality.child, r.cardinality.parent, r.inferred]),
    [
      ["profiles", "users", "one", "required", false],
      ["posts", "users", "many", "optional", false],
    ],
  );
});

test("erRelations: 推測は「単数_id」→ 主キーが id 1 つのテーブル。外部キーのある列・自分自身・主キーが id でないものは除く", () => {
  const users = table("users", [col("id", { pk: true })]);
  const categories = table("categories", [col("id", { pk: true })]);
  const people = table("people", [col("id", { pk: true })]);
  const codes = table("codes", [col("code", { pk: true, type: "text" })]);
  const items = table(
    "items",
    [col("id", { pk: true }), col("user_id"), col("category_id", { nullable: true }), col("person_id"), col("code_id"), col("item_id"), col("owner_id")],
    [fk(["owner_id"], "users")],
  );
  const all = [users, categories, people, codes, items];
  assert.equal(erRelations(all, { inferred: false }).length, 1);
  const guessed = erRelations(all, { inferred: true }).filter((r) => r.inferred);
  assert.deepEqual(
    guessed.map((r) => [r.fromColumns[0], r.to, r.cardinality.parent]),
    [
      ["user_id", "users", "required"],
      ["category_id", "categories", "optional"],
      ["person_id", "people", "required"],
    ],
  );
  // 外部キーのある列は推測しない
  const owned = table("orders", [col("id", { pk: true }), col("user_id")], [fk(["user_id"], "users")]);
  assert.equal(erRelations([users, owned], { inferred: true }).length, 1);
});

test("erNeighborhood: 向きを問わず depth 段まで（0 段は自分だけ）", () => {
  const rels = erRelations(
    [
      table("a", [col("id", { pk: true })]),
      table("b", [col("id", { pk: true }), col("a_id")], [fk(["a_id"], "a")]),
      table("c", [col("id", { pk: true }), col("b_id")], [fk(["b_id"], "b")]),
      table("d", [col("id", { pk: true })]),
    ],
    { inferred: false },
  );
  assert.deepEqual([...erNeighborhood(rels, "a", 0)], ["a"]);
  assert.deepEqual([...erNeighborhood(rels, "a", 1)].sort(), ["a", "b"]);
  assert.deepEqual([...erNeighborhood(rels, "c", 2)].sort(), ["a", "b", "c"]);
});

test("erMermaid: 列の出し方・PK / FK の印・多さの記号・推測は点線・使えない名前は引用符", () => {
  const users = table("users", [col("id", { pk: true }), col("name", { type: "character varying(40)" })]);
  const posts = table("投稿", [col("id", { pk: true }), col("user_id", { nullable: true }), col("category_id")], [fk(["user_id"], "users")]);
  const categories = table("categories", [col("id", { pk: true })]);
  const tables = [users, posts, categories];
  const rels = erRelations(tables, { inferred: true });
  const all = erMermaid(tables, rels, "all");
  assert.match(all, /^erDiagram\n {2}users \{\n {4}integer id PK\n {4}character_varying_40 name\n {2}\}/);
  assert.match(all, / {2}"投稿" \{\n {4}integer id PK\n {4}integer user_id FK\n {4}integer category_id\n/);
  assert.match(all, / {2}users \|o--o\{ "投稿" : "user_id"/);
  assert.match(all, / {2}categories \|\|\.\.o\{ "投稿" : "category_id（推測）"/);
  const keys = erMermaid(tables, rels, "keys");
  assert.doesNotMatch(keys, /name/);
  assert.match(keys, /user_id FK/);
  assert.match(erMermaid(tables, [], "names"), / {2}users \{\n {2}\}/);
});
