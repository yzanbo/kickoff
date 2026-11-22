import assert from "node:assert/strict";
import { test } from "vitest";
import { CHAT_TAIL_TURNS } from "@shared/chat/detail";
import { settle } from "@shared/foundation/testing/async";
import { openedTail, text } from "./storeTesting";

test("読み足しの最中の 2 つ目の頼みは捨てずに、1 つ目が終わってから流れる", async () => {
  const { store, pages } = await openedTail();
  const earlier = store.loadEarlier(1);
  const scope = store.loadScope(1, ["agent-a"]);
  assert.equal(pages.length, 1);
  pages[0].resolve({ events: [text(3)], has_earlier: true, has_later: false, head_partial: false });
  await earlier;
  await settle();
  // 2 つ目は、1 つ目を当てたあとの末尾（3 から）より前を読む
  assert.deepEqual(pages[1]?.query, { parents: "agent-a", before: 3 });
  pages[1].resolve({ events: [text(1, 1, { text: "中", parent: "agent-a" })], has_earlier: false, has_later: false, head_partial: false });
  await scope;
  assert.equal(pages.length, 2);
});

test("同じ流れの 2 回目の loadScope は読まない（待っている間に済んだものも）", async () => {
  const { store, pages } = await openedTail();
  const first = store.loadScope(1, ["agent-a"]);
  // 最中に、済むものを含む別の頼み（agent-a は 1 つ目が読むので、待ったあとは agent-b だけ）
  const second = store.loadScope(1, ["agent-a", "agent-b"]);
  pages[0].resolve({ events: [], has_earlier: false, has_later: false, head_partial: false });
  await first;
  await settle();
  assert.deepEqual(pages[1]?.query, { parents: "agent-b", before: 5 });
  pages[1].resolve({ events: [], has_earlier: false, has_later: false, head_partial: false });
  await second;
  await store.loadScope(1, ["agent-a"]);
  assert.equal(pages.length, 2);
});

test("読んでいる最中の同じ頼みは 1 つにまとめる", async () => {
  const { store, pages } = await openedTail();
  const earlier = store.loadEarlier(1);
  assert.equal(store.loadEarlier(1), earlier);
  assert.deepEqual(pages[0].query, { before: 5, turns: CHAT_TAIL_TURNS });
  pages[0].resolve({ events: [], has_earlier: false, has_later: false, head_partial: false });
  await earlier;
  assert.equal(pages.length, 1);
});
