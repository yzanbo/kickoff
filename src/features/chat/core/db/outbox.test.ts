import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { EMPTY_OUTBOX, type Outbox } from "@shared/chat/outbox";
import { makeAttachment, makeQueuedMessage } from "@shared/chat/testing";

const row = (id: string) => makeQueuedMessage(id, { options: { model: "opus" }, attachments: [makeAttachment("u1", { name: "a.png", size: 10 })], created_at: "2026-11-22T00:00:00.000Z" });

function setup() {
  const store = testStore();
  const project = store.projects.create({ name: "demo", repo_path: "/tmp/demo", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "A", status: "running", model: null });
  return { store, chat };
}

test("出す箱の保存: 預かり・送信待ち・線・止めておくかを丸ごと書いて読み戻し、行も線もなければ消す", () => {
  const { store, chat } = setup();
  const box: Outbox = { now: [{ ...row("h"), post_compact: true }], later: [row("a"), row("b")], stops: [1], paused: true };
  store.outbox.save(chat.id, box);
  assert.deepEqual(store.outbox.list(), [{ chatId: chat.id, box }]);
  // すべて送ったあとの線は、送信待ちが空でも残す
  store.outbox.save(chat.id, { ...EMPTY_OUTBOX, stops: [0] });
  assert.deepEqual(store.outbox.list()[0].box.stops, [0]);
  store.outbox.save(chat.id, EMPTY_OUTBOX);
  assert.deepEqual(store.outbox.list(), []);
});

test("出す箱の保存: チャットを消したら一緒に消え、もうないチャットの箱は書かない", () => {
  const { store, chat } = setup();
  store.outbox.save(chat.id, { ...EMPTY_OUTBOX, later: [row("a")] });
  assert.equal(store.outbox.list().length, 1);
  store.chats.delete(chat.id);
  assert.equal(store.outbox.list().length, 0);
  store.outbox.save(chat.id, { ...EMPTY_OUTBOX, later: [row("b")] });
  assert.equal(store.outbox.list().length, 0);
});
