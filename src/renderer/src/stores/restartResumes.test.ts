import assert from "node:assert/strict";
import { test } from "vitest";
import type { ChatLive, RestartResume } from "@shared/types";
import { makeChatLive } from "@shared/testing/factories";
import { autoOpenRestartResumes, reduceRestartResumes } from "./restartResumes";

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
/** 送信待ちが 1 件あり、再開の確かめを待っている様子 */
const live = (over: Partial<ChatLive>) =>
  makeChatLive({ queue: { messages: [row("a")], paused: false, stops: [], waiting_edit: false }, restart_resume: { interrupted: false, queued: true }, ...over });

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

test("確かめのダイアログを自動で開くか: まだ見せていないチャットが届いたときだけ開く（コアを作り直したあとに新しく止まったチャットでも。答えて外れたチャットがまた止まったときも）", () => {
  const ids = (shown: ReadonlySet<number>) => [...shown].sort((a, b) => a - b);
  // 起動のとき: 届くまでは開かない。届いたら開く
  let step = autoOpenRestartResumes(new Set(), []);
  assert.equal(step.open, false);
  step = autoOpenRestartResumes(step.shown, [resume(1), resume(2)]);
  assert.equal(step.open, true);
  // 閉じたあと、同じ一覧のまま（取り直し・送信待ちの直し）では開かない。答えて減っても開かない
  step = autoOpenRestartResumes(step.shown, [resume(1), resume(2)]);
  assert.equal(step.open, false);
  step = autoOpenRestartResumes(step.shown, [resume(2)]);
  assert.equal(step.open, false);
  assert.deepEqual(ids(step.shown), [2]);
  // コアのプロセスを作り直したあと: 新しく止まったチャットが届いたら、もう一度開く（前は窓ごとに 1 回だけで開かなかった）
  step = autoOpenRestartResumes(step.shown, [resume(2), resume(3)]);
  assert.equal(step.open, true);
  // 答えて一覧から外れたチャット（1）が、またあとで止まったときも開く
  step = autoOpenRestartResumes(step.shown, [resume(2), resume(3)]);
  assert.equal(step.open, false);
  step = autoOpenRestartResumes(step.shown, [resume(1), resume(2), resume(3)]);
  assert.equal(step.open, true);
  assert.deepEqual(ids(step.shown), [1, 2, 3]);
  // すべて答えて空になったあとに届いたものも開く
  step = autoOpenRestartResumes(autoOpenRestartResumes(step.shown, []).shown, [resume(3)]);
  assert.equal(step.open, true);
});
