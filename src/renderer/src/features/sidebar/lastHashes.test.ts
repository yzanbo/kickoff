import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLastHashes } from "./lastHashes";

test("parseLastHashes: 保存した形はそのまま読む", () => {
  assert.deepEqual(parseLastHashes('{"1":"#/projects/1/changes","2":"#/projects/2"}'), { 1: "#/projects/1/changes", 2: "#/projects/2" });
  assert.deepEqual(parseLastHashes(null), {});
  assert.deepEqual(parseLastHashes(""), {});
});

test("parseLastHashes: 壊れた値・形の違う値では落ちず、空にする", () => {
  assert.deepEqual(parseLastHashes("{oops"), {});
  assert.deepEqual(parseLastHashes("null"), {});
  assert.deepEqual(parseLastHashes("[1,2]"), {});
  assert.deepEqual(parseLastHashes('"#/projects/1"'), {});
  // 形の違う項目だけを捨てる
  assert.deepEqual(parseLastHashes('{"1":"#/projects/1","x":"#/","2":3}'), { 1: "#/projects/1" });
});
