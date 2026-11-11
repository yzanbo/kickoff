import assert from "node:assert/strict";
import { test } from "node:test";
import { closeConnectionTabs, closeDbTab, nextSqlTitle, NO_DB_TABS, openDbTab, parseDbClientTabs, tableTabKey, type DbClientTab } from "./dbClientTabs";

const path = { database: "main", schema: null };
const table = (name: string, connection_id = 1): DbClientTab => ({ key: tableTabKey(connection_id, path, name), kind: "table", connection_id, path, name, object: "table" });
const sql = (key: string, title: string, connection_id = 1): DbClientTab => ({ key, kind: "sql", connection_id, title });

test("openDbTab: 同じキーは選ぶだけ、新しいタブは表示中のタブの右", () => {
  let s = openDbTab(NO_DB_TABS, table("a"));
  s = openDbTab(s, table("b"));
  s = { ...s, active: s.tabs[0].key };
  s = openDbTab(s, table("c"));
  assert.deepEqual(
    s.tabs.map((t) => (t.kind === "table" ? t.name : t.title)),
    ["a", "c", "b"],
  );
  const again = openDbTab(s, table("b"));
  assert.equal(again.tabs.length, 3);
  assert.equal(again.active, table("b").key);
});

test("closeDbTab: 表示中なら右隣、右がなければ左隣。接続のタブをまとめて閉じる", () => {
  let s = [table("a"), table("b"), table("c")].reduce(openDbTab, NO_DB_TABS);
  s = { ...s, active: table("b").key };
  assert.equal(closeDbTab(s, table("b").key).active, table("c").key);
  s = { ...s, active: table("c").key };
  assert.equal(closeDbTab(s, table("c").key).active, table("b").key);
  assert.equal(closeDbTab(s, "nope"), s);
  const mixed = [table("a", 1), sql("q", "SQL 1", 2), table("b", 1)].reduce(openDbTab, NO_DB_TABS);
  assert.deepEqual(
    closeConnectionTabs(mixed, 1).tabs.map((t) => t.key),
    ["q"],
  );
});

test("tableTabKey: テーブルとビューは同じキー、関数・列挙型は同じ名前でも別のキー", () => {
  assert.equal(tableTabKey(1, path, "users"), tableTabKey(1, path, "users", "view"));
  assert.notEqual(tableTabKey(1, path, "users"), tableTabKey(1, path, "users", "function"));
  assert.notEqual(tableTabKey(1, path, "users", "function"), tableTabKey(1, path, "users", "enum"));
});

test("nextSqlTitle: 使っていないいちばん小さい番号", () => {
  const s = [sql("a", "SQL 1"), sql("b", "SQL 3")].reduce(openDbTab, NO_DB_TABS);
  assert.equal(nextSqlTitle(s), "SQL 2");
  assert.equal(nextSqlTitle(NO_DB_TABS), "SQL 1");
});

test("parseDbClientTabs: 形の合わないタブを捨て、表示中がなければ最初のタブ", () => {
  assert.equal(parseDbClientTabs(null), undefined);
  const parsed = parseDbClientTabs({ tabs: [table("a"), { key: "x", kind: "table" }, sql("q", "SQL 1")], active: "gone" });
  assert.deepEqual(
    parsed?.tabs.map((t) => t.key),
    [table("a").key, "q"],
  );
  assert.equal(parsed?.active, table("a").key);
});
