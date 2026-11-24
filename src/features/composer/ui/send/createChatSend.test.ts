import assert from "node:assert/strict";
import { test } from "vitest";
import type { SendBody } from "@shared/chat/send";
import type { HandoffFrom } from "@shared/chat/chatEvent";
import { SendCancelled } from "../useComposerSend";
import { createChatSend, type ChatSendDeps } from "./createChatSend";

/** 偽の送る口と、呼ばれた順の記録 */
function setup(over: Partial<ChatSendDeps> = {}, from: HandoffFrom | null = null) {
  const log: string[] = [];
  const bodies: SendBody[] = [];
  let mark = from;
  const chat = createChatSend({
    busy: false,
    queued: false,
    mode: "now",
    options: {},
    send: async (body) => void (bodies.push(body), log.push("send")),
    cancel: async () => void log.push("cancel"),
    confirmStop: async () => true,
    onStopping: (on) => log.push(`stopping:${on}`),
    beforeSend: async () => void log.push("before"),
    afterSend: () => log.push("follow"),
    from: { read: () => mark, clear: () => void (mark = null, log.push("clear")) },
    ...over,
  });
  return { chat, log, bodies, mark: () => mark };
}
const msg = { text: "a", attachments: [] };

test("createChatSend: 作業していなくて送信待ちもなければ when なしで続きを送る（送る前の保存 → 一番下へ → 送る）", async () => {
  const { chat, log, bodies } = setup();
  await chat.submit(msg, "later");
  assert.equal(bodies[0].when, undefined);
  assert.deepEqual(log, ["before", "follow", "send"]);
});

test("createChatSend: 作業中は いま = when now・あとで = when later（キーの mode が切り替えより先）", async () => {
  const a = setup({ busy: true, mode: "now" });
  await a.chat.submit(msg);
  await a.chat.submit(msg, "later");
  assert.deepEqual(a.bodies.map((b) => b.when), ["now", "later"]);
  assert.deepEqual(a.bodies.map((b) => b.hold), [undefined, undefined]);
});

test("createChatSend: 止めている送信待ちがあるとき、ためておく = later・hold（一番下へ付いていかない）・すぐ送る = when なし", async () => {
  const a = setup({ queued: true, mode: "later" });
  await a.chat.submit(msg);
  assert.deepEqual([a.bodies[0].when, a.bodies[0].hold], ["later", true]);
  assert.deepEqual(a.log, ["before", "send"]);
  const b = setup({ queued: true, mode: "now" });
  await b.chat.submit(msg);
  assert.equal(b.bodies[0].when, undefined);
});

test("createChatSend: 質問として送るは pause_after。出どころは入力欄から送るときだけ付け、送れたら消す", async () => {
  const from = { chat_id: 3, title: "子" };
  const a = setup({}, from);
  await a.chat.submit(msg, undefined, { asQuestion: true, viaComposer: true });
  assert.equal(a.bodies[0].pause_after, true);
  assert.deepEqual(a.bodies[0].handoff_from, from);
  assert.equal(a.mark(), null);
  const b = setup({}, from);
  await b.chat.submit(msg);
  assert.equal(b.bodies[0].handoff_from, undefined);
  assert.deepEqual(b.mark(), from);
});

test("createChatSend: 送る前にやめたら（SendCancelled）送らず、出どころも残す", async () => {
  const from = { chat_id: 3, title: "子" };
  const a = setup({ beforeSend: async () => Promise.reject(new SendCancelled()) }, from);
  await assert.rejects(a.chat.submit(msg, undefined, { viaComposer: true }), SendCancelled);
  assert.equal(a.bodies.length, 0);
  assert.deepEqual(a.mark(), from);
});

test("createChatSend: 中断は確かめてから（やめたら止めない）。失敗したら停止中を戻す", async () => {
  const a = setup({ confirmStop: async () => false });
  await a.chat.stop();
  assert.deepEqual(a.log, []);
  const b = setup({ cancel: async () => Promise.reject(new Error("x")) });
  await b.chat.stop();
  assert.deepEqual(b.log, ["stopping:true", "stopping:false"]);
});
