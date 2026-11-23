import assert from "node:assert/strict";
import { test } from "vitest";
import { isPinned, parseDbPins, pinsOf, togglePin, type DbPin } from "./dbPins";

const users: DbPin = { connection_id: 1, path: { database: "app", schema: "public" }, name: "users", kind: "table" };
const names: DbPin = { connection_id: 1, path: { database: "main", schema: null }, name: "user_names", kind: "view" };
const other: DbPin = { connection_id: 2, path: { database: null, schema: null }, name: "users", kind: "table" };

test("parseDbPins: 壊れたピンは捨てる。配列でなければ読めない", () => {
  assert.deepEqual(parseDbPins([users, names, other]), [users, names, other]);
  assert.deepEqual(parseDbPins(["not pin", { ...users, kind: "function" }, { ...users, connection_id: "1" }, { ...users, path: null }, names]), [names]);
  assert.equal(parseDbPins({}), undefined);
});

test("togglePin / isPinned / pinsOf: 留めた順に後ろへ足し、2 回で外す。接続ごとに分ける", () => {
  let pins = togglePin([], users);
  pins = togglePin(pins, other);
  pins = togglePin(pins, names);
  assert.ok(isPinned(pins, users));
  assert.deepEqual(pinsOf(pins, 1), [users, names]);
  assert.deepEqual(pinsOf(pins, 2), [other]);
  pins = togglePin(pins, { ...users });
  assert.equal(isPinned(pins, users), false);
  assert.deepEqual(pinsOf(pins, 1), [names]);
});
