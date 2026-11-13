import assert from "node:assert/strict";
import { test } from "node:test";
import { familyOrder, familyRelation } from "./chatFamily.js";

// 家系: 1 ─┬─ 2 ─┬─ 4
//          │      └─ 5
//          └─ 3 ─── 6
const path: Record<number, number[]> = { 1: [1], 2: [1, 2], 3: [1, 3], 4: [1, 2, 4], 5: [1, 2, 5], 6: [1, 3, 6] };
const rel = (self: number, target: number) => familyRelation(path[self], path[target]);

test("familyRelation: 自分から見た家系のチャットの関係（家系は最大 3 段）", () => {
  assert.equal(rel(2, 2), "自分");
  assert.equal(rel(2, 1), "親");
  assert.equal(rel(4, 1), "祖父母");
  assert.equal(rel(1, 2), "子");
  assert.equal(rel(1, 4), "孫");
  assert.equal(rel(2, 3), "兄弟");
  assert.equal(rel(4, 5), "兄弟");
  assert.equal(rel(2, 6), "兄弟の子");
  assert.equal(rel(4, 3), "親の兄弟");
  assert.equal(rel(4, 6), "いとこ");
});

test("familyRelation: 3 段より深いものも呼び名を返す", () => {
  assert.equal(familyRelation([1], [1, 2, 3, 4]), "3 段下の子孫");
  assert.equal(familyRelation([1, 2, 3, 4], [1]), "3 段上の祖先");
  assert.equal(familyRelation([1, 2, 3, 4], [1, 5, 6]), "同じ家系");
});

test("familyOrder: 親のすぐ下に子が続く並び（子どうしは ID の順）", () => {
  const chat = (id: number, parent_chat_id: number | null) => ({ id, parent_chat_id });
  // descendants は深い順に返すので、並びを崩して渡す
  const members = [chat(6, 3), chat(5, 2), chat(4, 2), chat(3, 1), chat(2, 1)];
  assert.deepEqual(
    familyOrder(chat(1, null), members).map((c) => c.id),
    [1, 2, 4, 5, 3, 6],
  );
});
