import assert from "node:assert/strict";
import { test } from "node:test";
import { reorderIds } from "./groups";

test("グループの並べ替え: ドロップした先のグループがいた位置に収まる", () => {
  const ids = [1, 2, 3];
  assert.deepEqual(reorderIds(ids, 1, 2), [2, 1, 3]); // 下へ 1 つ
  assert.deepEqual(reorderIds(ids, 1, 3), [2, 3, 1]); // いちばん下へ
  assert.deepEqual(reorderIds(ids, 3, 1), [3, 1, 2]); // いちばん上へ
  assert.equal(reorderIds(ids, 2, 2), ids); // 同じ場所なら変えない
});
