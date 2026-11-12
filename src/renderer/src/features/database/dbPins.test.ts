import assert from "node:assert/strict";
import { test } from "node:test";
import { isPinned, parsePin, pinId, pinsOf, togglePin, type DbPin } from "./dbPins";

const users: DbPin = { connection_id: 1, path: { database: "app", schema: "public" }, name: "users", kind: "table" };
const names: DbPin = { connection_id: 1, path: { database: "main", schema: null }, name: "user_names", kind: "view" };
const other: DbPin = { connection_id: 2, path: { database: null, schema: null }, name: "users", kind: "table" };

test("pinId / parsePin: 行き来できる。壊れた文字は null", () => {
  for (const p of [users, names, other]) assert.deepEqual(parsePin(pinId(p)), p);
  assert.equal(parsePin("not json"), null);
  assert.equal(parsePin(JSON.stringify([1, null, null, "function", "f"])), null);
  assert.equal(parsePin(JSON.stringify(["1", null, null, "table", "t"])), null);
  assert.equal(parsePin(JSON.stringify([1, null, null, "table"])), null);
});

test("togglePin / isPinned / pinsOf: 留めた順に後ろへ足し、2 回で外す。接続ごとに分ける", () => {
  let ids = togglePin([], users);
  ids = togglePin(ids, other);
  ids = togglePin(ids, names);
  assert.ok(isPinned(ids, users));
  assert.deepEqual(pinsOf(ids, 1), [users, names]);
  assert.deepEqual(pinsOf(ids, 2), [other]);
  ids = togglePin(ids, users);
  assert.equal(isPinned(ids, users), false);
  assert.deepEqual(pinsOf([...ids, "broken"], 1), [names]);
});
