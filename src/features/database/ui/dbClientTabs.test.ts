import assert from "node:assert/strict";
import { test } from "vitest";
import { closeTab, keepTab, openTab } from "@/foundation/ui/kit/tabs/tabList";
import { closeConnectionTabs, erTabKey, nextSqlTitle, NO_DB_TABS, openErTab, openNoteTab, openPreviewTab, setSqlConnection, openTableTab, parseDbClientTabs, renameNoteTab, setTableFilter, tableTabKey, type DbClientTab, type DbClientTabs, updateErTab } from "./dbClientTabs";

/** 仮でなく開く（reduce に渡すので引数を 2 つに絞る） */
const openDb = (s: DbClientTabs, tab: DbClientTab) => openTab(s, tab);

const path = { database: "main", schema: null };
const table = (name: string, connection_id = 1): DbClientTab => ({ key: tableTabKey(connection_id, path, name), kind: "table", connection_id, path, name, object: "table" });
const sql = (key: string, title: string, connection_id = 1): DbClientTab => ({ key, kind: "sql", connection_id, title });

test("openDb: 同じキーは選ぶだけ、新しいタブは表示中のタブの右", () => {
  let s = openDb(NO_DB_TABS, table("a"));
  s = openDb(s, table("b"));
  s = { ...s, active: s.tabs[0].key };
  s = openDb(s, table("c"));
  assert.deepEqual(
    s.tabs.map((t) => (t.kind === "table" ? t.name : t.kind === "sql" ? t.title : t.key)),
    ["a", "c", "b"],
  );
  const again = openDb(s, table("b"));
  assert.equal(again.tabs.length, 3);
  assert.equal(again.active, table("b").key);
});

test("closeTab: 表示中なら右隣、右がなければ左隣。接続のタブをまとめて閉じる", () => {
  let s = [table("a"), table("b"), table("c")].reduce(openDb, NO_DB_TABS);
  s = { ...s, active: table("b").key };
  assert.equal(closeTab(s, table("b").key).active, table("c").key);
  s = { ...s, active: table("c").key };
  assert.equal(closeTab(s, table("c").key).active, table("b").key);
  assert.equal(closeTab(s, "nope"), s);
  const mixed = [table("a", 1), sql("q", "SQL 1", 2), table("b", 1)].reduce(openDb, NO_DB_TABS);
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
  const s = [sql("a", "SQL 1"), sql("b", "SQL 3")].reduce(openDb, NO_DB_TABS);
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
  let s = openDb(NO_DB_TABS, table("a"));
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

test("openTableTab / setTableFilter: 絞り込みを付けて開く（もうあるタブも付け替える）・外す・保存した値も読める", () => {
  const filter = { filters: [{ column: "id", op: "eq" as const, value: "3" }], where: null };
  let s = openTableTab(NO_DB_TABS, { ...(table("users") as Extract<DbClientTab, { kind: "table" }>) });
  s = openTableTab(s, { ...(table("users") as Extract<DbClientTab, { kind: "table" }>), filter });
  assert.equal(s.tabs.length, 1);
  assert.deepEqual(s.tabs[0].kind === "table" && s.tabs[0].filter, filter);
  assert.deepEqual(parseDbClientTabs(JSON.parse(JSON.stringify(s))), s);
  s = setTableFilter(s, s.tabs[0].key, null);
  assert.equal(s.tabs[0].kind === "table" && "filter" in s.tabs[0], false);
  // 形の合わない絞り込みのタブは捨てる
  assert.equal(parseDbClientTabs({ tabs: [{ ...table("x"), filter: { filters: [{ column: "a", op: "like", value: "" }], where: null } }], active: null })!.tabs.length, 0);
});

test("openNoteTab / renameNoteTab: 手順ノートはノートごとに 1 つ。名前が変わったら付け替え、同じノートのタブがあれば 1 つにする。保存した値も読める", () => {
  let s = openNoteTab(NO_DB_TABS, 1, "DB/本番.md");
  s = openNoteTab(s, 2, "DB/本番.md");
  assert.deepEqual(s.tabs, [{ key: "note:DB/本番.md", kind: "note", connection_id: 1, path: "DB/本番.md" }]);
  s = renameNoteTab(s, "note:DB/本番.md", "DB/AWS 本番.md");
  assert.deepEqual([s.active, s.tabs[0].key, s.tabs[0].kind === "note" && s.tabs[0].path], ["note:DB/AWS 本番.md", "note:DB/AWS 本番.md", "DB/AWS 本番.md"]);
  s = openNoteTab(s, 1, "DB/ローカル.md");
  s = renameNoteTab(s, "note:DB/ローカル.md", "DB/AWS 本番.md");
  assert.deepEqual([s.tabs.length, s.active], [1, "note:DB/AWS 本番.md"]);
  assert.equal(parseDbClientTabs(JSON.parse(JSON.stringify(s)))?.tabs.length, 1);
  assert.equal(parseDbClientTabs({ tabs: [{ key: "note:", kind: "note", connection_id: 1, path: "" }], active: null })?.tabs.length, 0);
});

test("openPreviewTab / keepTab: 仮のタブは次の仮のタブで同じ場所に置き換わり、固定したもの・変更のあるものは残る。固定して開く・絞り込みでも固定", () => {
  const preview = (name: string) => table(name) as Extract<DbClientTab, { kind: "table" }>;
  let s = openDb(NO_DB_TABS, table("a"));
  s = openPreviewTab(s, preview("b"));
  s = openPreviewTab(s, preview("c"));
  const names = (x: typeof s) => x.tabs.map((t) => (t.kind === "table" ? `${t.name}${t.preview ? "*" : ""}` : t.key));
  assert.deepEqual(names(s), ["a", "c*"]);
  assert.equal(s.active, table("c").key);
  // もうあるタブは選ぶだけ（固定したものは仮にしない）
  assert.deepEqual(names(openPreviewTab(s, preview("a"))), ["a", "c*"]);
  // 固定すると、次の仮のタブは右に足す
  s = keepTab(s, table("c").key);
  s = openPreviewTab(s, preview("d"));
  assert.deepEqual(names(s), ["a", "c", "d*"]);
  // 変更のある仮のタブは固定して残す
  s = openPreviewTab(s, preview("e"), (key) => key === table("d").key);
  assert.deepEqual(names(s), ["a", "c", "d", "e*"]);
  // 固定して開く・絞り込みで固定
  assert.deepEqual(names(openTableTab(s, preview("e"))), ["a", "c", "d", "e"]);
  assert.deepEqual(names(setTableFilter(s, table("e").key, { filters: [], where: "1 = 1" })), ["a", "c", "d", "e"]);
  // 保存した値も読める
  assert.deepEqual(parseDbClientTabs(JSON.parse(JSON.stringify(s))), s);
});

test("setSqlConnection: SQL のタブの接続だけ替える（ほかの種類・ほかのタブは変えない）", () => {
  const s = { tabs: [sql("s1", "SQL 1"), table("a")], active: "s1" };
  const next = setSqlConnection(s, "s1", 2);
  assert.equal(next.tabs[0].connection_id, 2);
  assert.equal(next.tabs[1], s.tabs[1]);
  assert.equal(setSqlConnection(s, table("a").key, 3).tabs[1].connection_id, 1);
});
