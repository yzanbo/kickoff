import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatLive, RestartResume } from "@shared/types";
import { reduceRestartResumes } from "./restartResumes";

const row = (id: string) => ({ id, text: id, options: {}, attachments: [], created_at: "2026-11-07T00:00:00.000Z" });
const resume = (chatId: number): RestartResume => ({
  chat_id: chatId,
  project_id: 1,
  title: "A",
  interrupted: false,
  queued: true,
  messages: [row("a")],
  stops: [],
  last_prompt: null,
  last_reply: null,
  last_tool: null,
  stopped_at: null,
  subagents: [],
});
const live = (over: Partial<ChatLive>): ChatLive => ({
  queue: { messages: [row("a")], paused: false, stops: [], waiting_edit: false },
  background: null,
  retry: null,
  reconnect: null,
  compacting: null,
  stopping: false,
  drawing_visual: false,
  after_compact: [],
  awaiting_compact: false,
  compact_after_turn: false,
  compacted_turn: false,
  tells_closed: false,
  inheriting: false,
  restart_resume: { interrupted: false, queued: true },
  ...over,
});

test("起動したときの再開の確かめの一覧: 答えた・空になった・消したら外し、送信待ちが変わったら中身を直す", () => {
  const list = [resume(1), resume(2)];
  // 関係のない知らせ・ほかのチャットでは同じ一覧
  assert.equal(reduceRestartResumes(list, { type: "memos", project_id: 1, path: null }), list);
  assert.equal(reduceRestartResumes(list, { type: "chat_live", project_id: 1, chat_id: 9, live: live({}) }), list);
  // 答えた（restart_resume が null）
  assert.deepEqual(
    reduceRestartResumes(list, { type: "chat_live", project_id: 1, chat_id: 1, live: live({ restart_resume: null }) }).map((r) => r.chat_id),
    [2],
  );
  // 送信待ちを直した
  const edited = reduceRestartResumes(list, {
    type: "chat_live",
    project_id: 1,
    chat_id: 2,
    live: live({ queue: { messages: [row("b"), row("c")], paused: false, stops: [1], waiting_edit: false } }),
  });
  assert.deepEqual([edited[1].messages.map((m) => m.id), edited[1].stops], [["b", "c"], [1]]);
  // チャットを消した
  assert.deepEqual(reduceRestartResumes(list, { type: "chat_deleted", id: 2, project_id: 1 }).map((r) => r.chat_id), [1]);
});

test("起動したときの再開の確かめの一覧: 途中で止まったチャットは、送信待ちを聞かなくなっても・空になっても続けるかを聞き続ける", () => {
  const list = [{ ...resume(1), interrupted: true }];
  const answeredQueue = reduceRestartResumes(list, {
    type: "chat_live",
    project_id: 1,
    chat_id: 1,
    live: live({ restart_resume: { interrupted: true, queued: false } }),
  });
  assert.deepEqual(answeredQueue.map((r) => [r.chat_id, r.queued, r.messages.length]), [[1, false, 0]]);
  // 同じ様子がもう一度届いても同じ一覧
  assert.equal(reduceRestartResumes(answeredQueue, { type: "chat_live", project_id: 1, chat_id: 1, live: live({ restart_resume: { interrupted: true, queued: false } }) }), answeredQueue);
  // 送信待ちのないチャット: 空の送信待ちでも残す
  const noQueue = [{ ...resume(2), interrupted: true, queued: false, messages: [] }];
  const empty = live({ queue: { messages: [], paused: false, stops: [], waiting_edit: false }, restart_resume: { interrupted: true, queued: false } });
  assert.equal(reduceRestartResumes(noQueue, { type: "chat_live", project_id: 1, chat_id: 2, live: empty }), noQueue);
});
