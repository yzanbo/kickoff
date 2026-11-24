import assert from "node:assert/strict";
import { test } from "vitest";
import { isTreeKeyOpen, parseTreeKey, treeKey, withTreeKeyOpen } from "./treeKeys";

test("treeKey / parseTreeKey: 名前に「:」があっても DB・スキーマの段に戻る", () => {
  assert.deepEqual(parseTreeKey(treeKey.schema(3, "app:prod", "a:b")), { level: "schema", connectionId: 3, path: { database: "app:prod", schema: "a:b" } });
  assert.deepEqual(parseTreeKey(treeKey.database(3, "x:y")), { level: "database", connectionId: 3, path: { database: "x:y", schema: null } });
  assert.deepEqual(parseTreeKey(treeKey.database(3, null)), { level: "database", connectionId: 3, path: { database: null, schema: null } });
});

test("treeKey: 違う名前は違うキー（「:」で区切りがずれない）", () => {
  const path = { database: "a", schema: "b:c" };
  assert.notEqual(treeKey.table(1, path, "d"), treeKey.table(1, { database: "a:b", schema: "c" }, "d"));
  assert.notEqual(treeKey.kindClosed(1, path, "table"), treeKey.kindClosed(1, { database: "a", schema: "b" }, "table"));
});

test("parseTreeKey: 接続・テーブルの段と壊れたキーは null", () => {
  for (const k of [treeKey.connection(1), treeKey.others(1), treeKey.table(1, { database: "a", schema: null }, "t"), "s:x:a:b", "d:1:a:b:c"]) assert.equal(parseTreeKey(k), null);
});

test("isTreeKeyOpen / withTreeKeyOpen: 段は開いた段を、種類ごとの段は閉じた段を覚える", () => {
  const db = treeKey.database(1, "a");
  const kind = treeKey.kindClosed(1, { database: "a", schema: null }, "table");
  assert.equal(isTreeKeyOpen([], db), false);
  assert.equal(isTreeKeyOpen([], kind), true);
  const opened = withTreeKeyOpen([], db, true);
  assert.deepEqual(opened, [db]);
  assert.deepEqual(withTreeKeyOpen(opened, kind, false), [db, kind]);
  assert.equal(isTreeKeyOpen([kind], kind), false);
  assert.deepEqual(withTreeKeyOpen([kind], kind, true), []);
  assert.equal(withTreeKeyOpen(opened, db, true), opened);
});
