import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { col, table, type TableChange } from "./table";

const items = table(
  "items",
  {
    id: col.int(),
    name: col.text(),
    note: col.text().nullable(),
    done: col.bool(),
    tags: col.json<string[]>(),
    grp: col.int().nullable(),
    position: col.int(),
    score: col.real().nullable(),
    trashed_at: col.time().nullable().hidden(),
    created_at: col.time(),
    updated_at: col.time(),
  },
  { hide: { column: "trashed_at" }, order: "position, id", position: { column: "position", base: 0, group: "grp" }, touch: "updated_at" },
);

function setup(base: 0 | 1 = 0) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    note TEXT,
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
    tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
    grp INTEGER,
    position INTEGER NOT NULL,
    score REAL,
    trashed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT`);
  const changes: TableChange<unknown>[] = [];
  const def = base === 0 ? items : table(items.name, items.columns, { order: "position, id", position: { column: "position", base: 1 } });
  return { db, store: def.on(db, (c) => changes.push(c)), changes };
}

test("table: 真偽値・JSON・数・NULL を行の型に変換し、hidden の列は行に出さない", () => {
  const { store } = setup();
  const row = store.insert({ name: "a", done: true, tags: ["x", "y"], score: 1.5, unknown_column: "捨てる" });
  assert.equal(row.done, true);
  assert.deepEqual(row.tags, ["x", "y"]);
  assert.equal(row.note, null);
  assert.equal(row.score, 1.5);
  assert.equal(typeof row.created_at, "string");
  assert.equal("trashed_at" in row, false);
  // 行の型は宣言から引く（hidden の列は型にも出さない）
  const typed: { id: number; done: boolean; tags: string[]; note: string | null; score: number | null } = row;
  // @ts-expect-error trashed_at は hidden
  assert.equal(typed === row && row.trashed_at, undefined);
  assert.deepEqual(store.toRow({ done: false, tags: [], note: undefined }), { done: 0, tags: "[]" });
  assert.deepEqual(store.fromRow({ id: 1, name: "b", done: 0, tags: "[]", note: null, trashed_at: "x" }), { id: 1, name: "b", done: false, tags: [], note: null });
});

test("table: hide の行は get・list・one から外し、raw では読める", () => {
  const { db, store } = setup();
  const a = store.insert({ name: "a" });
  const b = store.insert({ name: "b" });
  store.update(b.id, { trashed_at: "2026-01-01T00:00:00.000Z" });
  assert.equal(store.get(b.id), undefined);
  assert.deepEqual(store.list().map((r) => r.name), ["a"]);
  assert.equal(store.one("name = ?", ["b"]), undefined);
  assert.equal(store.raw.get(b.id)?.name, "b");
  assert.deepEqual(store.raw.list().map((r) => r.name), ["a", "b"]);
  assert.deepEqual(store.list("name LIKE ?", ["%"]).map((r) => r.id), [a.id]);
  // 値は ? で渡す（列の名前でない文字を SQL にしない）
  assert.equal(store.one("name = ?", ["a' OR 1 = 1 --"]), undefined);
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n), 2);
});

test("table: update は undefined の項目を変えず、touch の列を進める。ない行は NotFound", () => {
  const { db, store, changes } = setup();
  const a = store.insert({ name: "a", note: "メモ" });
  db.prepare("UPDATE items SET updated_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(a.id);
  const updated = store.update(a.id, { name: undefined, note: null, done: true });
  assert.equal(updated.name, "a");
  assert.equal(updated.note, null);
  assert.equal(updated.done, true);
  assert.notEqual(updated.updated_at, "2000-01-01T00:00:00.000Z");
  assert.throws(() => store.update(999, { name: "x" }), /items に 999 がありません/);
  assert.deepEqual(changes.map((c) => c.kind), ["upsert", "upsert"]);
  assert.equal(store.remove(a.id), true);
  assert.equal(store.remove(a.id), false);
  assert.deepEqual(changes.at(-1), { kind: "delete", id: a.id });
});

test("table: nextPosition は group ごとに base から数え、insert で position を省くと次の位置に置く", () => {
  const { store } = setup();
  assert.equal(store.nextPosition(1), 0);
  assert.equal(store.insert({ name: "a", grp: 1 }).position, 0);
  assert.equal(store.insert({ name: "b", grp: 1 }).position, 1);
  assert.equal(store.insert({ name: "c", grp: 2 }).position, 0);
  assert.equal(store.insert({ name: "d" }).position, 0);
  assert.equal(store.nextPosition(1), 2);
  assert.equal(store.nextPosition(null), 1);

  const one = setup(1).store;
  assert.equal(one.nextPosition(), 1);
  assert.equal(one.insert({ name: "a" }).position, 1);
  assert.equal(one.insert({ name: "b" }).position, 2);
});

test("table: reorder は ids の順にし、重なり・知らない ID・ほかの group を捨て、書いていない行はいまの順で後ろに続ける", () => {
  const { store, changes } = setup();
  const [a, b, c, d] = ["a", "b", "c", "d"].map((name) => store.insert({ name, grp: 1 }));
  const other = store.insert({ name: "x", grp: 2 });
  changes.length = 0;
  const after = store.reorder([c.id, a.id, c.id, 999, other.id], 1);
  assert.deepEqual(after.map((r) => r.name), ["c", "a", "b", "d"]);
  assert.deepEqual(after.map((r) => r.position), [0, 1, 2, 3]);
  // 位置が変わった行（c・a・b）だけを書いて知らせる
  assert.equal(changes.length, 3);
  assert.equal(store.get(d.id)?.position, 3);
  assert.equal(store.get(other.id)?.position, 0);
  assert.equal(store.get(b.id)?.position, 2);

  const one = setup(1).store;
  const [p, q] = ["p", "q"].map((name) => one.insert({ name }));
  assert.deepEqual(one.reorder([q.id]).map((r) => [r.name, r.position]), [["q", 1], ["p", 2]]);
  assert.equal(one.get(p.id)?.position, 2);
});

test("table: pruneKeep は新しい順に keep 件だけ残す（group ごと・order を選べる）", () => {
  const { store } = setup();
  for (const name of ["a", "b", "c", "d"]) store.insert({ name, grp: 1 });
  for (const name of ["x", "y"]) store.insert({ name, grp: 2 });
  store.pruneKeep({ keep: 2, group: { column: "grp", value: 1 } });
  assert.deepEqual(store.list().map((r) => r.name).sort(), ["c", "d", "x", "y"]);
  store.pruneKeep({ keep: 1, group: { column: "grp", value: 2 }, order: "name ASC" });
  assert.deepEqual(store.list().map((r) => r.name).sort(), ["c", "d", "x"]);
  store.pruneKeep({ keep: 1 });
  assert.deepEqual(store.list().map((r) => r.name), ["x"]);
});

test("table: 同じ SQL の文は 1 回だけ prepare する", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, tags TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '') STRICT");
  let prepared = 0;
  const counting = { prepare: (sql: string) => (prepared++, db.prepare(sql)) };
  const store = table("items", { id: col.int(), name: col.text() }).on(counting);
  store.insert({ name: "a" });
  const after = prepared;
  store.get(1);
  store.get(1);
  store.insert({ name: "b" });
  assert.equal(prepared, after);
});
