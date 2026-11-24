import assert from "node:assert/strict";
import { test } from "vitest";
import { sideByOrder } from "./useReorder";

test("sideByOrder: 上から下へは相手の後ろ、下から上へは前。同じ・並びにないなら null", () => {
  const keys = [1, 2, 3];
  assert.equal(sideByOrder(keys, 1, 2), "after"); // 下へ 1 つ
  assert.equal(sideByOrder(keys, 1, 3), "after"); // いちばん下へ
  assert.equal(sideByOrder(keys, 3, 1), "before"); // いちばん上へ
  assert.equal(sideByOrder(keys, 2, 2), null); // 同じ場所
  assert.equal(sideByOrder(keys, 9, 2), null);
});
