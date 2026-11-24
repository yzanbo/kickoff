import assert from "node:assert/strict";
import { test } from "vitest";
import { createWindowBus } from "./windowBus";

declare module "./windowBus" {
  interface WindowMessageMap {
    /** テストだけの知らせ */
    sampleA: { n: number };
    sampleB: { text: string };
  }
}

/** 送ったものを並べ、届いたことにできる偽の口 */
function fakeChannel() {
  const sent: unknown[] = [];
  let listener: ((e: MessageEvent<{ type: string; payload: unknown }>) => void) | undefined;
  return {
    sent,
    deliver: (data: { type: string; payload: unknown }) => listener?.({ data } as MessageEvent<{ type: string; payload: unknown }>),
    postMessage: (message: unknown) => void sent.push(message),
    addEventListener: (_type: "message", l: typeof listener) => void (listener = l),
  };
}

test("createWindowBus: { type, payload } で送り、届いたものはその種類の受け手だけに配る", () => {
  const channel = fakeChannel();
  const bus = createWindowBus(channel);
  bus.post("sampleA", { n: 1 });
  assert.deepEqual(channel.sent, [{ type: "sampleA", payload: { n: 1 } }]);
  const gotA: number[] = [];
  const gotB: string[] = [];
  const offA = bus.on("sampleA", (m) => gotA.push(m.n));
  bus.on("sampleB", (m) => gotB.push(m.text));
  channel.deliver({ type: "sampleA", payload: { n: 2 } });
  channel.deliver({ type: "sampleB", payload: { text: "b" } });
  // 受け手のない種類は捨てる
  channel.deliver({ type: "unknown", payload: null });
  assert.deepEqual(gotA, [2]);
  assert.deepEqual(gotB, ["b"]);
  // やめたら届かない
  offA();
  channel.deliver({ type: "sampleA", payload: { n: 3 } });
  assert.deepEqual(gotA, [2]);
});

test("createWindowBus: 口がなければ（テストの Node）送らず、受け手を付けても届かない", () => {
  const bus = createWindowBus(undefined);
  bus.post("sampleA", { n: 1 });
  const off = bus.on("sampleA", () => assert.fail("届かない"));
  off();
});
