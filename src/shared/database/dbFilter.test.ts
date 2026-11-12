import assert from "node:assert/strict";
import { test } from "node:test";
import { filterSql, isEmptyFilter, plainLike, previewRowsSql, type FilterDialect } from "./dbFilter";

const q = (n: string) => `"${n.replaceAll('"', '""')}"`;
const sqlite: FilterDialect = { quote: q, placeholder: () => "?", like: plainLike };
const pg: FilterDialect = { quote: q, placeholder: (n) => `$${n + 1}`, like: (c, not, p) => `CAST(${c} AS text) ${not ? "NOT ILIKE" : "ILIKE"} ${p} ESCAPE '!'` };

test("filterSql: 条件を AND でつなぎ、値はすべて params（LIKE の % _ ! は文字として扱う）", () => {
  const r = filterSql(
    {
      filters: [
        { column: "name", op: "contains", value: "50%_off!" },
        { column: "age", op: "ge", value: "20" },
        { column: "deleted_at", op: "is_null", value: "ignored" },
        { column: "", op: "eq", value: "x" },
      ],
      where: null,
    },
    sqlite,
  );
  assert.equal(r.clause, ` WHERE "name" LIKE ? ESCAPE '!' AND "age" >= ? AND "deleted_at" IS NULL`);
  assert.deepEqual(r.params, ["%50!%!_off!!%", "20"]);
});

test("filterSql: PostgreSQL は番号の置き場所（start から）と ILIKE、始まる・含まない・≠", () => {
  const r = filterSql(
    {
      filters: [
        { column: "a", op: "starts", value: "ab" },
        { column: "b", op: "not_contains", value: "z" },
        { column: "c", op: "ne", value: "" },
      ],
      where: null,
    },
    pg,
    2,
  );
  assert.equal(r.clause, ` WHERE CAST("a" AS text) ILIKE $3 ESCAPE '!' AND CAST("b" AS text) NOT ILIKE $4 ESCAPE '!' AND "c" <> $5`);
  assert.deepEqual(r.params, ["ab%", "%z%", ""]);
});

test("filterSql: WHERE の文があれば条件の代わりにそのまま（改行で挟んで、行末のコメントが後ろを消さない）。空なら何もしない", () => {
  assert.deepEqual(filterSql({ filters: [{ column: "a", op: "eq", value: "1" }], where: " id > 3 -- x " }, sqlite), { clause: " WHERE (\nid > 3 -- x\n)", params: [] });
  assert.deepEqual(filterSql({ filters: [], where: null }, sqlite), { clause: "", params: [] });
  assert.equal(isEmptyFilter({ filters: [{ column: "", op: "eq", value: "" }], where: "  " }), true);
  assert.equal(isEmptyFilter({ filters: [{ column: "a", op: "is_null", value: "" }], where: null }), false);
});

test("previewRowsSql: 値を文字列の形で埋めた、見せるための SQL", () => {
  assert.equal(
    previewRowsSql("users", { filters: [{ column: "name", op: "eq", value: "O'Neil" }], where: null }, [{ column: "id", desc: true }], q, 100),
    `SELECT * FROM "users" WHERE "name" = 'O''Neil' ORDER BY "id" DESC LIMIT 100`,
  );
  assert.equal(previewRowsSql("t", { filters: [], where: "a = 1" }, [], q, 100), `SELECT * FROM "t" WHERE (a = 1) LIMIT 100`);
  // 場所つきの名前（SQL のタブで開くとき）
  assert.equal(previewRowsSql("t", { filters: [], where: null }, [], q, 100, `"app"."t"`), `SELECT * FROM "app"."t" LIMIT 100`);
});
