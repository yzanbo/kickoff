import assert from "node:assert/strict";
import { test } from "node:test";
import { closeConnectionTabs, closeDbTab, erTabKey, nextSqlTitle, NO_DB_TABS, openDbTab, openErTab, parseDbClientTabs, tableTabKey, updateErTab, type DbClientTab } from "./dbClientTabs";

const path = { database: "main", schema: null };
const table = (name: string, connection_id = 1): DbClientTab => ({ key: tableTabKey(connection_id, path, name), kind: "table", connection_id, path, name, object: "table" });
const sql = (key: string, title: string, connection_id = 1): DbClientTab => ({ key, kind: "sql", connection_id, title });

test("openDbTab: 同じキーは選ぶだけ、新しいタブは表示中のタブの右", () => {
  let s = openDbTab(NO_DB_TABS, table("a"));
  s = openDbTab(s, table("b"));
  s = { ...s, active: s.tabs[0].key };
  s = openDbTab(s, table("c"));
  assert.deepEqual(
    s.tabs.map((t) => (t.kind === "table" ? t.name : t.kind === "sql" ? t.title : t.key)),
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

test("openErTab: 接続・場所ごとに 1 つ。開き直すと focus を付け替えて選び、絞り込みは updateErTab で変える。保存した値も読める", () => {
  let s = openDbTab(NO_DB_TABS, table("a"));
  s = openErTab(s, 1, path, null);
  const key = erTabKey(1, path);
  assert.equal(s.active, key);
  s = { ...s, active: s.tabs[0].key };
  s = openErTab(s, 1, path, "users");
  assert.equal(s.tabs.length, 2);
  assert.equal(s.active, key);
  const er = s.tabs[1];
  assert.ok(er.kind === "er" && er.focus === "users" && er.depth === 1 && er.names === null);
  s = updateErTab(s, key, { depth: 2, names: ["users", "posts"] });
  assert.deepEqual(parseDbClientTabs(JSON.parse(JSON.stringify(s))), s);
  // 選んだテーブルにない focus なら選び直す・あれば残す
  const kept = openErTab(s, 1, path, "posts").tabs[1];
  assert.ok(kept.kind === "er" && kept.names?.length === 2);
  const reset = openErTab(s, 1, path, "tags").tabs[1];
  assert.ok(reset.kind === "er" && reset.focus === "tags" && reset.names === null);
  assert.equal(parseDbClientTabs({ tabs: [{ key: "er:1::", kind: "er", connection_id: 1, path, focus: 3, depth: 1, names: null }], active: null })!.tabs.length, 0);
});
