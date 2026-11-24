import assert from "node:assert/strict";
import { test } from "vitest";
import { Undo } from "./undo";

test("Undo: 足した順の逆に流し、途中の失敗は warn に書いて残りも流す。2 回目の run は何もしない", async () => {
  const order: string[] = [];
  const warns: string[] = [];
  const undo = new Undo({ warn: (msg) => warns.push(msg) });
  undo.add(() => void order.push("a"));
  undo.add(async () => {
    order.push("b");
    throw new Error("戻せない");
  });
  undo.add(async () => void order.push("c"));
  await undo.run();
  assert.deepEqual(order, ["c", "b", "a"]);
  assert.equal(warns.length, 1);
  await undo.run();
  assert.deepEqual(order, ["c", "b", "a"]);
});
