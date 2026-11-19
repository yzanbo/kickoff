import { test } from "vitest";
import assert from "node:assert/strict";
import { createKeepAlive } from "./keepAlive";

test("createKeepAlive: 持ち主ごとに理由を覚え、すべて外れるまで止めない", () => {
  const k = createKeepAlive();
  const a = Symbol("a");
  const b = Symbol("b");
  k.set(1, a, "upload", true);
  k.set(1, b, "upload", true);
  assert.equal(k.alive(1), true);
  k.set(1, a, "upload", false);
  assert.equal(k.alive(1), true);
  assert.deepEqual(k.reasons(1), ["upload"]);
  k.set(1, b, "upload", false);
  assert.equal(k.alive(1), false);
  // ほかのチャットには効かない
  k.set(2, a, "voice", true);
  assert.equal(k.alive(1), false);
  assert.equal(k.alive(2), true);
});

test("createKeepAlive: 止めるかが変わったときだけ知らせ、clear ですべて外す", () => {
  const k = createKeepAlive();
  let calls = 0;
  const off = k.subscribe(1, () => calls++);
  k.set(1, "voice", "voice", true);
  k.set(1, "voice", "voice", true);
  k.set(1, "edit", "queueEdit", true);
  assert.equal(calls, 1);
  k.set(1, "voice", "voice", false);
  assert.equal(calls, 1);
  k.clear(1);
  assert.equal(calls, 2);
  assert.equal(k.alive(1), false);
  // 立っていない理由を外しても知らせない
  k.set(1, "voice", "voice", false);
  k.clear(1);
  assert.equal(calls, 2);
  off();
  k.set(1, "voice", "voice", true);
  assert.equal(calls, 2);
});
