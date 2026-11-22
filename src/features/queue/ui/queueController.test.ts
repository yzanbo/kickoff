import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { EMPTY_QUEUE_STATE, type QueueState } from "@shared/chat/chatLive";
import type { QueueCommand } from "@shared/chat/queueCommand";
import type { QueuedMessage } from "@shared/chat/types";
import { createQueueController, queueViewOf } from "./queueController";

const row = (id: string): QueuedMessage => ({ id, text: id, options: {}, attachments: [], created_at: "" });
const stateOf = (ids: string[], stops: number[] = []): QueueState => ({ ...EMPTY_QUEUE_STATE, messages: ids.map(row), stops });

/** 偽の口: 送った命令を覚え、resolve / reject を外から決める */
function setup() {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
  const calls: { commands: QueueCommand[]; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const failures: unknown[] = [];
  const c = createQueueController({
    run: (commands) => new Promise<void>((resolve, reject) => void calls.push({ commands, resolve, reject })),
    send: () => Promise.resolve(),
    failed: (e) => void failures.push(e),
  });
  return { c, calls, failures };
}

test("並べ替えは応答を待たずに出し、応答が届いてコアの並びが変わったら先回りを捨てる", async () => {
  const { c, calls } = setup();
  const before = stateOf(["a", "b", "c"]);
  c.settle(before);
  const done = c.run({ op: "move", ids: ["c"], to: { index: 0 } });
  assert.deepEqual(queueViewOf(before, c.pending()).messages.map((m) => m.id), ["c", "a", "b"]);
  calls[0].resolve();
  assert.equal(await done, true);
  // 応答が届いてもコアの並びが同じ間は先回りを残す（知らせが遅れても前の並びに戻して見せない）
  assert.equal(c.pending().length, 1);
  c.settle(stateOf(["c", "a", "b"]));
  assert.equal(c.pending().length, 0);
});

test("失敗したら先回りを戻して知らせる・応答がなくてもしばらくで戻す", async () => {
  const { c, calls, failures } = setup();
  c.settle(stateOf(["a", "b"]));
  const done = c.run({ op: "set_stops", stops: [1] });
  calls[0].reject(new Error("x"));
  assert.equal(await done, false);
  assert.equal(c.pending().length, 0);
  assert.equal(failures.length, 1);
  void c.run({ op: "set_stops", stops: [0] });
  assert.equal(c.pending().length, 1);
  vi.advanceTimersByTime(3000);
  assert.equal(c.pending().length, 0);
});

test("印の線を続けて 2 回足すと 2 本になる（2 回目は先回りした並びから作る）", () => {
  const { c, calls } = setup();
  const state = stateOf(["a", "b"]);
  c.settle(state);
  for (let i = 0; i < 2; i++) void c.run({ op: "set_stops", stops: [0, ...queueViewOf(state, c.pending()).stops] });
  assert.deepEqual(calls.map((x) => x.commands[0]), [
    { op: "set_stops", stops: [0] },
    { op: "set_stops", stops: [0, 0] },
  ]);
  assert.deepEqual(queueViewOf(state, c.pending()).stops, [0, 0]);
});

test("消す命令は先回りしない", () => {
  const { c } = setup();
  void c.run({ op: "remove", ids: ["a"] });
  assert.equal(c.pending().length, 0);
});
