import assert from "node:assert/strict";
import { test } from "vitest";
import { runEach } from "./runEach";

test("runEach: 1 件ずつ順に進め、失敗は飛ばして最後にまとめ、やめたものはどちらにも入れない", async () => {
  const order: string[] = [];
  const result = await runEach(["a", "b", "c", "d"], async (x) => {
    order.push(x);
    if (x === "b") throw new Error("同じ名前があります");
    return x !== "c";
  });
  assert.deepEqual(order, ["a", "b", "c", "d"]);
  assert.deepEqual(result.done, ["a", "d"]);
  assert.deepEqual(result.failed.map((f) => [f.item, (f.error as Error).message]), [["b", "同じ名前があります"]]);
});
