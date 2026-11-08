import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat, makeGroup } from "@shared/testing/factories";
import { approvalIndex } from "@/features/chat/chatState";
import { bucketChats } from "./buckets";
import { bucketScopes, byManual, draftAnchor, moveChatInOrder } from "./manualOrder";

test("byManual: まだ並べていない新しいチャットがいちばん上（新しい順）、そのあと position の順", () => {
  const chats = [makeChat(1, { position: 1 }), makeChat(2, { position: 0 }), makeChat(3), makeChat(4), makeChat(5, { position: 2 })];
  assert.deepEqual([...chats].sort(byManual).map((c) => c.id), [4, 3, 2, 1, 5]);
});

test("bucketScopes: いちばん外のまとまりのキー（中の段も同じ）。まとまりのアーカイブ済みはそのキー", () => {
  const groups = [makeGroup(4, { position: 1 })];
  const chats = [makeChat(1, { group_id: 4, status: "running" }), makeChat(2, { group_id: 4 }), makeChat(3, { group_id: 4, archived_at: "x" }), makeChat(5, { pinned: true }), makeChat(6)];
  const buckets = bucketChats(chats, { pending: approvalIndex([]), groupsOf: () => groups, by: ["group", "status"], project: 1, pinned: true, archived: "nested" });
  const scopes = bucketScopes(buckets);
  assert.equal(scopes.get(1), "p1/g4");
  assert.equal(scopes.get(2), "p1/g4");
  assert.equal(scopes.get(3), "p1/g4/archived");
  assert.equal(scopes.get(5), "p1/pinned");
  assert.equal(scopes.get(6), "p1/ungrouped");
});

test("moveChatInOrder: target の前・後ろへ動かす。動かせない・変わらないなら null", () => {
  assert.deepEqual(moveChatInOrder([1, 2, 3, 4], 4, 2, "before"), [1, 4, 2, 3]);
  assert.deepEqual(moveChatInOrder([1, 2, 3, 4], 1, 3, "after"), [2, 3, 1, 4]);
  assert.equal(moveChatInOrder([1, 2, 3], 1, 2, "before"), null);
  assert.equal(moveChatInOrder([1, 2, 3], 2, 2, "after"), null);
  assert.equal(moveChatInOrder([1, 2, 3], 9, 2, "after"), null);
});

test("draftAnchor: タブの列で下書きより前に見える、同じまとまりのチャットのいちばん後ろ。なければ null", () => {
  // サイドバーの並び 3 → 1 → 2。ペインは [c1, c2, 新, c3] → 並べ替えると [c3, c1, 新, c2]
  const order = new Map([
    [3, 0],
    [1, 1],
    [2, 2],
  ]);
  const spot = { chatIds: [1, 2, 3], before: 2 };
  assert.equal(draftAnchor(spot, order, () => true), 1);
  // 同じまとまりのチャットだけを見る
  assert.equal(draftAnchor(spot, order, (id) => id !== 1), 3);
  assert.equal(draftAnchor(spot, order, (id) => id === 2), null);
  // いちばん前のタブなら null
  assert.equal(draftAnchor({ chatIds: [1, 2], before: 0 }, order, () => true), null);
  // サイドバーの並びにないチャットは後ろ
  assert.equal(draftAnchor({ chatIds: [9, 2], before: 1 }, order, () => true), 2);
});
