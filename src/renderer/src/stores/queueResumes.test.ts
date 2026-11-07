import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatLive, QueueResume } from "@shared/types";
import { reduceQueueResumes } from "./queueResumes";

const row = (id: string) => ({ id, text: id, options: {}, attachments: [], created_at: "2026-11-07T00:00:00.000Z" });
const resume = (chatId: number): QueueResume => ({
  chat_id: chatId,
  project_id: 1,
  title: "A",
  interrupted: false,
  messages: [row("a")],
  stops: [],
  last_prompt: null,
  last_reply: null,
  last_tool: null,
  stopped_at: null,
});
const live = (over: Partial<ChatLive>): ChatLive => ({
  queue: { messages: [row("a")], paused: false, stops: [], waiting_edit: false },
  background: null,
  retry: null,
  reconnect: null,
  compacting: null,
  stopping: false,
  after_compact: [],
  awaiting_compact: false,
  compact_after_turn: false,
  queue_resume: { interrupted: false },
  ...over,
});

test("起動したときの送信待ちの確かめの一覧: 答えた・空になった・消したら外し、送信待ちが変わったら中身を直す", () => {
  const list = [resume(1), resume(2)];
  // 関係のない知らせ・ほかのチャットでは同じ一覧
  assert.equal(reduceQueueResumes(list, { type: "memos", project_id: 1, path: null }), list);
  assert.equal(reduceQueueResumes(list, { type: "chat_live", project_id: 1, chat_id: 9, live: live({}) }), list);
  // 答えた（queue_resume が null）
  assert.deepEqual(
    reduceQueueResumes(list, { type: "chat_live", project_id: 1, chat_id: 1, live: live({ queue_resume: null }) }).map((r) => r.chat_id),
    [2],
  );
  // 送信待ちを直した
  const edited = reduceQueueResumes(list, {
    type: "chat_live",
    project_id: 1,
    chat_id: 2,
    live: live({ queue: { messages: [row("b"), row("c")], paused: false, stops: [1], waiting_edit: false } }),
  });
  assert.deepEqual([edited[1].messages.map((m) => m.id), edited[1].stops], [["b", "c"], [1]]);
  // チャットを消した
  assert.deepEqual(reduceQueueResumes(list, { type: "chat_deleted", id: 2, project_id: 1 }).map((r) => r.chat_id), [1]);
});
