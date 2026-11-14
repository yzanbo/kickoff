import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat } from "@shared/testing/factories";
import { childRowDrop, insertNear } from "./childRowDrop";

// 根 1 → 子 2 → 孫 3 → ひ孫 4、根 1 の下の子 5（兄弟）、ほかの家系の 6・固定の 7・アーカイブ済みの 8・ほかのプロジェクトの 9
const chats = [
  makeChat(1),
  makeChat(2, { parent_chat_id: 1 }),
  makeChat(3, { parent_chat_id: 2 }),
  makeChat(4, { parent_chat_id: 3 }),
  makeChat(5, { parent_chat_id: 1 }),
  makeChat(6),
  makeChat(7, { pinned: true }),
  makeChat(8, { archived_at: "2026-11-14T00:00:00Z" }),
  makeChat(9, { project_id: 2 }),
];
const lookup = (id: number) => chats.find((c) => c.id === id);
const drop = (dragged: number, target: number, flat = true) => childRowDrop(lookup(dragged)!, lookup(target)!, lookup, flat);

test("childRowDrop: 先祖の行（いまの親より上）なら into、同じ家系のほかの行は block", () => {
  assert.equal(drop(4, 1), "into");
  assert.equal(drop(4, 2), "into");
  assert.equal(drop(4, 3), "block"); // いまの親
  assert.equal(drop(4, 4), "block"); // 自分
  assert.equal(drop(3, 5), "block"); // 親の兄弟
  assert.equal(drop(2, 4), "block"); // 自分の子孫
  assert.equal(drop(2, 1), "block"); // 子の親 = 根
});

test("childRowDrop: ほかの家系の親のない行は、まとめないときだけ between（固定・アーカイブ済み・ほかのプロジェクトは受けない）", () => {
  assert.equal(drop(3, 6), "between");
  assert.equal(drop(3, 6, false), null);
  assert.equal(drop(3, 7), null);
  assert.equal(drop(3, 8), null);
  assert.equal(drop(3, 9), null);
  // 親のないチャットのドラッグは扱わない（いつもの並べ替え）
  assert.equal(drop(6, 1), null);
});

test("insertNear: 前後へ入れ、もとの位置にあれば動かす。target がなければ null", () => {
  assert.deepEqual(insertNear([1, 6, 7], 3, 6, "before"), [1, 3, 6, 7]);
  assert.deepEqual(insertNear([1, 6, 7], 3, 7, "after"), [1, 6, 7, 3]);
  assert.deepEqual(insertNear([3, 1, 6], 3, 6, "after"), [1, 6, 3]);
  assert.equal(insertNear([1, 6], 3, 9, "after"), null);
});
