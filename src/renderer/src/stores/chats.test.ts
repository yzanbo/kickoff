import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { chatsByProject, childChatsOf, NO_CHATS, reduceChats, selectChats, upsertChat } from "./chats";

const chat = (id: number, project_id: number, active_at: string, archived_at: string | null = null) => makeChat(id, { project_id, active_at, archived_at });
const ids = (list: readonly Chat[]) => list.map((r) => r.id);

test("upsertChat: 最後に動いた順の位置に入れ、同じ ID は置き換える（同じ時刻なら新しく作った順）", () => {
  const list = [chat(3, 1, "2026-01-03"), chat(2, 1, "2026-01-02"), chat(1, 1, "2026-01-01")];
  assert.deepEqual(ids(upsertChat(list, chat(1, 1, "2026-01-04"))), [1, 3, 2]);
  assert.deepEqual(ids(upsertChat(list, chat(4, 1, "2026-01-02"))), [3, 4, 2, 1]);
  assert.deepEqual(ids(upsertChat(list, chat(5, 1, "2025-12-31"))), [3, 2, 1, 5]);
  assert.deepEqual(ids(upsertChat([], chat(6, 1, "2026-01-01"))), [6]);
});

test("reduceChats: アーカイブした・戻したチャットは一方の一覧から外れ、もう一方に入る", () => {
  const active = [chat(2, 1, "2026-01-02"), chat(1, 1, "2026-01-01")];
  const archived = [chat(9, 1, "2025-01-01", "2026-01-05")];
  const archiving = chat(1, 1, "2026-01-01", "2026-01-06");
  assert.deepEqual(ids(reduceChats(active, { type: "chat", chat: archiving }, false)), [2]);
  assert.deepEqual(ids(reduceChats(archived, { type: "chat", chat: archiving }, true)), [1, 9]);
  const restoring = chat(9, 1, "2025-01-01");
  assert.deepEqual(ids(reduceChats(active, { type: "chat", chat: restoring }, false)), [2, 1, 9]);
  assert.deepEqual(ids(reduceChats(archived, { type: "chat", chat: restoring }, true)), []);
});

test("reduceChats: 削除・プロジェクトの削除で外し、関係のない知らせでは同じ一覧のまま", () => {
  const list = [chat(3, 2, "c"), chat(2, 1, "b"), chat(1, 1, "a")];
  assert.deepEqual(ids(reduceChats(list, { type: "chat_deleted", id: 2, project_id: 1 }, false)), [3, 1]);
  assert.equal(reduceChats(list, { type: "chat_deleted", id: 99, project_id: 1 }, false), list);
  assert.deepEqual(ids(reduceChats(list, { type: "project_deleted", id: 1 }, false)), [3]);
  assert.equal(reduceChats(list, { type: "project_deleted", id: 9 }, false), list);
  assert.equal(reduceChats(list, { type: "group_deleted", id: 1, project_id: 1 }, false), list);
  // 別のプロジェクトへ移したチャットは、プロジェクトの ID が変わって届く
  assert.deepEqual(reduceChats(list, { type: "chat", chat: chat(1, 2, "a") }, false).find((r) => r.id === 1)?.project_id, 2);
});

test("selectChats: そのプロジェクトのチャットを、アーカイブ済みも合わせて最後に動いた順に（なければ空の同じ配列）", () => {
  const active = [chat(3, 1, "2026-01-03"), chat(2, 2, "2026-01-02")];
  const archived = [chat(4, 1, "2026-01-04", "x"), chat(1, 1, "2026-01-01", "x")];
  assert.deepEqual(ids(selectChats(active, undefined)), [3, 2]);
  assert.deepEqual(ids(selectChats(active, undefined, 1)), [3]);
  assert.deepEqual(ids(selectChats(active, archived, 1)), [4, 3, 1]);
  assert.equal(selectChats(undefined, undefined), NO_CHATS);
  assert.equal(selectChats(active, archived, 9), NO_CHATS);
});

test("chatsByProject: プロジェクトごとに分け、中身の同じプロジェクトは前の配列のまま（すべて同じなら前のもの）", () => {
  const list = [chat(3, 1, "c"), chat(2, 2, "b"), chat(1, 1, "a")];
  const first = chatsByProject(list);
  assert.deepEqual(ids(first[1]), [3, 1]);
  assert.deepEqual(ids(first[2]), [2]);
  assert.equal(chatsByProject([...list], first), first);
  const changed = chatsByProject([chat(4, 2, "d"), ...list], first);
  assert.equal(changed[1], first[1]);
  assert.deepEqual(ids(changed[2]), [4, 2]);
  // チャットのなくなったプロジェクトは消える
  assert.deepEqual(Object.keys(chatsByProject([list[1]], first)), ["2"]);
});

test("子チャット: 一覧（selectChats）には入れず、childChatsOf で親ごとに引く", () => {
  const parent = makeChat(1, { active_at: "2026-01-01T00:00:00Z" });
  const child = makeChat(2, { parent_chat_id: 1, active_at: "2026-01-03T00:00:00Z" });
  const grandchild = makeChat(3, { parent_chat_id: 2, active_at: "2026-01-02T00:00:00Z" });
  const archivedChild = makeChat(4, { parent_chat_id: 1, archived_at: "2026-01-04T00:00:00Z", active_at: "2026-01-04T00:00:00Z" });
  assert.deepEqual(ids(selectChats([parent, child, grandchild], [archivedChild])), [1]);
  const map = childChatsOf([parent, child, grandchild], [archivedChild]);
  assert.deepEqual(ids(map.get(1)!), [4, 2]);
  assert.deepEqual(ids(map.get(2)!), [3]);
  assert.equal(childChatsOf([parent], undefined).size, 0);
});
