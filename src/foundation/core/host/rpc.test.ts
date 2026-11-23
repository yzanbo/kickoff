import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { test } from "vitest";
import { afterTest } from "@/foundation/core/testing/afterTest";
import { manualClock } from "@/foundation/core/testing/manualClock";
import { until } from "@/foundation/core/testing/until";
import { nodeRpcPort } from "./ports";
import { RPC_TIMEOUTS, timeoutOf, type CoreMethods } from "./protocol";
import { createRpc } from "./rpc";

interface A {
  add(a: number, b: number): Promise<number>;
  fail(): Promise<void>;
}
interface B {
  hello(name: string): Promise<string>;
  slow(): Promise<void>;
}
interface AEvents {
  tick: number;
}
interface BEvents {
  done: { ok: boolean };
}

/** Node の MessageChannel の両端を口に包む（テストのあとに閉じる） */
function channel() {
  const { port1, port2 } = new MessageChannel();
  afterTest(() => {
    port1.close();
    port2.close();
  });
  return { a: nodeRpcPort(port1), b: nodeRpcPort(port2), port1, port2 };
}

test("RPC: 呼び出しと返事・失敗の文・知らせが両方向に届く", async () => {
  const { a, b } = channel();
  const sideA = createRpc<A, B, AEvents, BEvents>(a, { handlers: { add: async (x, y) => x + y, fail: async () => Promise.reject(new Error("タブが見つかりません")) } });
  let release: (() => void) | undefined;
  const sideB = createRpc<B, A, BEvents, AEvents>(b, { handlers: { hello: async (name) => `こんにちは ${name}`, slow: () => new Promise<void>((r) => (release = r)) } });
  assert.equal(await sideB.call("add", 2, 3), 5);
  assert.equal(await sideA.call("hello", "コア"), "こんにちは コア");
  await assert.rejects(sideB.call("fail"), (e: Error) => e.message === "タブが見つかりません");
  // 知らない名前は失敗の文で返る
  await assert.rejects((sideA.call as (m: string) => Promise<unknown>)("nope"), /知らない呼び出しです: nope/);

  const ticks: number[] = [];
  sideB.on("tick", (n) => ticks.push(n));
  const done = new Promise<{ ok: boolean }>((resolve) => sideA.on("done", resolve));
  sideA.emit("tick", 1);
  sideA.emit("tick", 2);
  sideB.emit("done", { ok: true });
  assert.deepEqual(await done, { ok: true });
  await until(() => ticks.length === 2);
  assert.deepEqual(ticks, [1, 2]);

  // 待っている呼び出しは、答えが届くまで返らない
  let returned = false;
  const slow = sideA.call("slow").then(() => void (returned = true));
  await until(() => release !== undefined);
  assert.equal(returned, false);
  release!();
  await slow;
  assert.equal(returned, true);
});

test("RPC: 時間の上限を過ぎたら失敗にする（時計は引数）。上限なしのものは待ち続ける", async () => {
  const { a, b } = channel();
  const clock = manualClock();
  const sideA = createRpc<A, B, AEvents, BEvents>(a, { handlers: { add: async (x, y) => x + y, fail: async () => {} }, clock, timeoutOf: (m) => (m === "slow" ? 5000 : null) });
  createRpc<B, A, BEvents, AEvents>(b, { handlers: { hello: async (n) => n, slow: () => new Promise<void>(() => {}) } });
  const slow = sideA.call("slow");
  assert.equal(clock.pending, 1);
  clock.fireAll();
  await assert.rejects(slow, /slow が 5 秒で返りませんでした/);
  // 上限なしは時計を使わない
  assert.equal(await sideA.call("hello", "x"), "x");
  assert.equal(clock.pending, 0);
});

test("RPC: メインがコアに作業中のチャットを聞く runningChats は 1 秒で打ち切る（コアが詰まっていても ⌘Q で終えられる。メモの仕様書「0026」の D11）", async () => {
  type Core = Pick<CoreMethods, "runningChats">;
  const { a, b } = channel();
  const clock = manualClock();
  // メインプロセスの CoreProcess と同じ上限（RPC_TIMEOUTS）で呼ぶ。上限の長さも覚える
  const limits: number[] = [];
  const timers = { setTimeout: (fn: () => void, ms: number) => (limits.push(ms), clock.setTimeout(fn, ms)), clearTimeout: clock.clearTimeout };
  const main = createRpc<Record<string, never>, Core, Record<string, never>, Record<string, never>>(a, { handlers: {}, clock: timers, timeoutOf: (method) => timeoutOf(RPC_TIMEOUTS, method) });
  // コアの答え（呼ばれるたびに、答える関数を入れ替える）
  const core = { answer: null as ((chats: { id: number; title: string | null }[]) => void) | null };
  createRpc<Core, Record<string, never>, Record<string, never>, Record<string, never>>(b, { handlers: { runningChats: () => new Promise((r) => (core.answer = r)) } });

  // 答えが返らない（コアが詰まっている）: 1 秒で失敗にする（メインはそのとき聞かずに終える）
  const stuck = main.call("runningChats");
  assert.deepEqual(limits, [1_000]);
  clock.fireAll();
  await assert.rejects(stuck, /runningChats が 1 秒で返りませんでした/);
  // メインの受け方（shutdown.ts）: 聞けなければ作業中のチャットはないものとして、聞かずに終える
  const fallback = main.call("runningChats").catch(() => []);
  clock.fireAll();
  assert.deepEqual(await fallback, []);

  // 1 秒より前に答えれば、作業中のチャットが届く（時計は外す）
  core.answer = null;
  const asked = main.call("runningChats");
  await until(() => core.answer !== null);
  core.answer!([{ id: 7, title: "作業中" }]);
  assert.deepEqual(await asked, [{ id: 7, title: "作業中" }]);
  assert.equal(clock.pending, 0);
});

test("RPC: 口が閉じたら、待っている呼び出しを失敗にし、以後の呼び出しもすぐ失敗にする", async () => {
  const { a, b, port2 } = channel();
  const sideA = createRpc<A, B, AEvents, BEvents>(a, { handlers: { add: async (x, y) => x + y, fail: async () => {} } });
  createRpc<B, A, BEvents, AEvents>(b, { handlers: { hello: async (n) => n, slow: () => new Promise<void>(() => {}) } });
  const slow = sideA.call("slow");
  port2.close();
  await assert.rejects(slow, /Kickoff のコアのプロセスが止まりました/);
  await assert.rejects(sideA.call("hello", "x"), /止まりました/);
  // 閉じたあとの知らせは捨てる（投げない）
  sideA.emit("tick", 1);
});

test("RPC: 口を添えた知らせ（DB ワーカーの port）は RPC の外の形として持ち主に届く", async () => {
  const { a, b } = channel();
  const extra = new MessageChannel();
  afterTest(() => {
    extra.port1.close();
    extra.port2.close();
  });
  const got = new Promise<{ message: unknown; ports: unknown[] }>((resolve) => b.onMessage((message, ports) => resolve({ message, ports })));
  a.post({ t: "port", purpose: "dbWorker", workerId: 1 }, [extra.port1]);
  const { message, ports } = await got;
  assert.deepEqual(message, { t: "port", purpose: "dbWorker", workerId: 1 });
  assert.equal(ports.length, 1);
});
