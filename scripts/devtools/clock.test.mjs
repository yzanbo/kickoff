import assert from "node:assert/strict";
import vm from "node:vm";
import { test } from "vitest";
import { fixedClockSource } from "./clock.mjs";

const NOW = Date.parse("2026-11-19T12:00:00+09:00");

test("引数なしの Date は起点から進み、日付を渡した Date と Date の関数はそのまま", () => {
  // 別の世界（vm）で流し、このプロセスの Date は替えない
  const context = vm.createContext({});
  vm.runInContext(fixedClockSource(NOW), context);
  const read = (code) => vm.runInContext(code, context);
  assert.ok(Math.abs(read("Date.now()") - NOW) < 1000);
  assert.ok(Math.abs(read("new Date().getTime()") - NOW) < 1000);
  assert.equal(read("typeof Date()"), "string");
  assert.equal(read('new Date("2026-01-02T03:04:05Z").toISOString()'), "2026-01-02T03:04:05.000Z");
  assert.equal(read("new Date(0).getTime()"), 0);
  assert.equal(read('Date.parse("2026-01-02T03:04:05Z")'), Date.parse("2026-01-02T03:04:05Z"));
  assert.equal(read("new Date() instanceof Date"), true);
});
