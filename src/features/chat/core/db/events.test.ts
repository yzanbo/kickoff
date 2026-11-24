import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { makeAttachment } from "@shared/chat/testing";

/** 記録を足したチャット（ほかのチャットの記録も混ぜる） */
function seeded() {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const other = store.chats.create({ project_id: project.id, provider: "claude", title: "d", status: "completed" });
  const add = store.events.add.bind(store.events);
  const ids = [
    add(chat.id, { type: "user", text: "はじめ", message_uuid: "u1" }).id,
    add(chat.id, { type: "tool_use", id: "t1", name: "Write", input: { file_path: "a.ts", content: "長い中身" } }).id,
    add(chat.id, { type: "text", text: "サブの答え", parent: "t0" }).id,
    add(chat.id, { type: "tool_result", tool_use_id: "t1", content: "visual: v1", is_error: false }).id,
    add(chat.id, { type: "text", text: "答え" }).id,
    add(chat.id, { type: "result", status: "completed", session_id: "s1" }).id,
    add(chat.id, { type: "user", text: "つぎ", message_uuid: "u2" }).id,
    add(chat.id, { type: "result", status: "failed" }).id,
  ];
  add(other.id, { type: "user", text: "ほか", message_uuid: "u3" });
  return { store, chat, ids };
}

test("list: 範囲・種類・ID・件数・向き・サブエージェントを外す・ツールの引数を空にする、を組み合わせて読む（ほかのチャットは読まない）", () => {
  const { store, chat, ids } = seeded();
  const e = store.events;
  const idsOf = (list: { id: number }[]) => list.map((x) => ids.indexOf(x.id));
  assert.deepEqual(idsOf(e.list(chat.id)), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(idsOf(e.list(chat.id, { after: ids[1], before: ids[5] })), [2, 3, 4]);
  assert.deepEqual(idsOf(e.list(chat.id, { from: ids[1], to: ids[3] })), [1, 2]);
  assert.deepEqual(idsOf(e.list(chat.id, { types: ["user"], after: ids[0], limit: 1 })), [6]);
  assert.deepEqual(idsOf(e.list(chat.id, { desc: true, limit: 2 })), [7, 6]);
  assert.deepEqual(idsOf(e.list(chat.id, { ids: [ids[7], ids[0], ids[3]] })), [0, 3, 7]);
  assert.deepEqual(idsOf(e.list(chat.id, { ids: [ids[7], ids[0], ids[3]], desc: true, limit: 2 })), [7, 3]);
  assert.deepEqual(idsOf(e.list(chat.id, { types: ["user", "text"], mainOnly: true })), [0, 4, 6]);
  const light = e.list(chat.id, { types: ["tool_use"], light: true })[0];
  assert.deepEqual(light.type === "tool_use" && light.data, { id: "t1", name: "Write", input: {} });
  // 名前の付いた読み取りは、新しい口と同じものを返す
  assert.deepEqual(e.before(chat.id, ids[5], 2), e.list(chat.id, { from: ids[3], to: ids[5] }));
  assert.deepEqual(e.before(chat.id, null, 2), e.list(chat.id, { after: ids[5] }));
  assert.deepEqual(idsOf(e.mainTexts(chat.id, ids[6])), [0, 4]);
  assert.deepEqual(e.workplaceMoves(chat.id), []);
});

test("latestId・exists・latestResult: 種類・メインの返答・範囲で絞り、なければ null / false", () => {
  const { store, chat, ids } = seeded();
  const e = store.events;
  assert.equal(e.latestId(chat.id), ids[7]);
  assert.equal(e.latestId(chat.id, { type: "user" }), ids[6]);
  assert.equal(e.latestId(chat.id, { type: "user", before: ids[6] }), ids[0]);
  assert.equal(e.latestId(chat.id, { mainText: true }), ids[4]);
  assert.equal(e.latestId(chat.id, { type: ["error"], mainText: true }), ids[4]);
  assert.equal(e.latestId(chat.id, { type: "compact" }), null);
  assert.equal(e.latestUnreadId(chat.id), ids[7]);
  assert.equal(e.exists(chat.id, { type: "user" }), true);
  assert.equal(e.exists(chat.id, { after: ids[6], type: "user" }), false);
  assert.equal(e.exists(chat.id, { id: ids[2] }), true);
  assert.equal(e.exists(chat.id, { id: ids[7] + 1 }), false);
  assert.equal(e.exists(chat.id, { from: ids[7] + 1 }), false);
  assert.equal(e.exists(chat.id, { toolResultContains: "visual: v1" }), true);
  assert.equal(e.exists(chat.id, { toolResultContains: "visual: v2" }), false);
  assert.equal(e.latestResult(chat.id)?.id, ids[7]);
  assert.equal(e.latestResult(chat.id, { withSession: true })?.id, ids[5]);
  assert.equal(e.latestResult(chat.id, { before: ids[5] }), null);
});

test("uploadsInUse: 候補の添付のうち、記録（発言・回答・AI の交代）か出す箱が使っているものを 1 回の読み取りで返す（ゴミ箱のチャットも数える）", () => {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "c", status: "completed" });
  const [a, b, c, d] = ["aaaaaaaa", "bbbbbbbb", "cccccccc", "dddddddd"].map((h) => `${h}-0000-4000-8000-000000000000`);
  store.events.add(chat.id, { type: "user", text: "見て", attachments: [makeAttachment(a)], message_uuid: "u1" });
  store.events.add(chat.id, { type: "provider_switched", from: "claude", to: "codex", handoff_attachments: [makeAttachment(b)] });
  // ツールの結果の中の同じ形の文字は数えない
  store.events.add(chat.id, { type: "tool_result", tool_use_id: "t1", content: d, is_error: false });
  store.outbox.save(chat.id, { now: [], later: [{ id: "q1", text: "", options: {}, attachments: [makeAttachment(c)], created_at: "2026-11-22T00:00:00.000Z" }], stops: [], paused: false });
  assert.deepEqual([...store.events.uploadsInUse([a, b, c, d])].sort(), [a, b, c]);
  assert.deepEqual([...store.events.uploadsInUse([])], []);
});
