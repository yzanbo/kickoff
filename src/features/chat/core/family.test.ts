import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import type { Chat } from "@shared/chat/types";
import { depthOf, descendantsOf, familyOf, lineageOf, type ChatLookup } from "./family";

/** チャットの並びから作る読み取り（descendants は店と同じく深いものから ID の順） */
function lookupOf(chats: Chat[]): ChatLookup {
  const byId = new Map(chats.map((c) => [c.id, c]));
  const depthIn = (c: Chat, rootId: number): number => (c.parent_chat_id === rootId ? 1 : c.parent_chat_id === null ? Infinity : depthIn(byId.get(c.parent_chat_id)!, rootId) + 1);
  return {
    get: (id) => byId.get(id),
    descendants: (rootId) =>
      chats
        .map((c) => ({ c, depth: depthIn(c, rootId) }))
        .filter(({ depth }) => depth !== Infinity)
        .sort((a, b) => b.depth - a.depth || a.c.id - b.c.id)
        .map(({ c }) => c),
  };
}

// 家系: 1 ─┬─ 2 ─── 4
//          └─ 3
const family = [makeChat(1), makeChat(2, { parent_chat_id: 1 }), makeChat(3, { parent_chat_id: 1 }), makeChat(4, { parent_chat_id: 2 })];
const chats = lookupOf(family);
const ids = (list: Chat[]) => list.map((c) => c.id);

test("家系: いちばん上の親からの並び・深さ・子孫", () => {
  assert.deepEqual(ids(lineageOf(chats, family[3])), [1, 2, 4]);
  assert.deepEqual(family.map((c) => depthOf(chats, c)), [0, 1, 1, 2]);
  assert.deepEqual(ids(descendantsOf(chats, 1)), [4, 2, 3]);
});

test("家系: 親のすぐ下に子が続く並びと、自分から見た関係", () => {
  const { members, relationOf } = familyOf(chats, family[3]);
  assert.deepEqual(ids(members), [1, 2, 4, 3]);
  assert.deepEqual(members.map(relationOf), ["祖父母", "親", "自分", "親の兄弟"]);
});

test("家系: 親子が輪になっていても止まり、上へは 20 段まで", () => {
  const loop = lookupOf([makeChat(1, { parent_chat_id: 2 }), makeChat(2, { parent_chat_id: 1 })]);
  assert.deepEqual(ids(lineageOf(loop, loop.get(1)!)), [2, 1]);
  const deep = Array.from({ length: 30 }, (_, i) => makeChat(i + 1, { parent_chat_id: i === 0 ? null : i }));
  assert.equal(depthOf(lookupOf(deep), deep[29]), 20);
  // たどれない親の手前で止まる
  assert.deepEqual(ids(lineageOf(chats, makeChat(9, { parent_chat_id: 99 }))), [9]);
});
