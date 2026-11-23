// コアの見張り役: 落ちたら残った子を止めてから作り直し、5 分に 3 回落ちたら止める（Electron の utilityProcess は偽の子）
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test, vi } from "vitest";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { settle } from "@shared/foundation/testing/async";
import type { CoreState } from "@shared/foundation/ipc";

/** 偽のコアのプロセス（init を受けたら ready を返す。exit で落ちたことにする） */
class FakeChild extends EventEmitter {
  constructor(readonly pid: number) {
    super();
  }
  postMessage(message: { t?: string }) {
    if (message.t === "init") queueMicrotask(() => this.emit("message", { t: "ready", ready: { pid: this.pid, token: "t", localUrl: "http://127.0.0.1:1", timings: {} } }));
  }
  kill() {
    this.emit("exit", 0);
  }
}
const forked: FakeChild[] = [];
vi.mock("electron", () => ({
  utilityProcess: { fork: () => (forked.push(new FakeChild(1000 + forked.length)), forked.at(-1)) },
  MessageChannelMain: class {},
}));

test("CoreProcess: 落ちたら残った子を（親を確かめてから）止めて作り直し、続けて落ちたら failed で止める", async () => {
  const clock = manualClock();
  const { CoreProcess } = await import("./coreProcess");
  const states: CoreState[] = [];
  const killed: number[] = [];
  const core = new CoreProcess({
    file: "core.js",
    args: [],
    dbWorkerFile: "dbWorker.js",
    init: () => ({}) as never,
    handlers: {} as never,
    onState: (s) => states.push(s),
    log: () => {},
    clock,
    // 覚えた子 77 は落ちたコアの子としてプロセスの表にある。止めたら終わる
    host: { processTable: async () => new Map([[77, { pid: 77, ppid: 1000, elapsed: null, command: "claude" }]]), alive: (pid) => !killed.includes(pid) },
  });
  vi.spyOn(process, "kill").mockImplementation((pid) => void killed.push(Number(pid)) as never);
  await core.start();
  assert.equal(core.state, "ready");
  forked[0].emit("message", { t: "event", name: "children", payload: { state: "started", pid: 77, group: false } });
  // 落ちる → 子を止める → 0.5 秒待って作り直す
  forked[0].emit("exit", 1);
  await settle();
  await clock.advance(600);
  await settle();
  assert.deepEqual(killed, [77]);
  assert.equal(forked.length, 2);
  assert.equal(core.state, "ready");
  // 5 分のうちに続けて 2 回落ちたら、3 回目で作り直さない
  forked[1].emit("exit", 1);
  await settle();
  await clock.advance(2_100);
  await settle();
  forked[2].emit("exit", 1);
  await settle();
  await clock.advance(10_000);
  await settle();
  assert.equal(forked.length, 3);
  assert.deepEqual(states, ["ready", "restarting", "ready", "restarting", "ready", "failed"]);
  await core.close(10);
});
