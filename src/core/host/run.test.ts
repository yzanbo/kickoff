import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { test } from "vitest";
import { Bus } from "../bus.js";
import type { Core, CoreOptions } from "../index.js";
import type { HostPlatform } from "../platform/types.js";
import { afterTest } from "../testing/afterTest.js";
import { until } from "../testing/testCore.js";
import type { CoreEvents, CoreInit, CoreMethods, HostEvents, HostMethods } from "./protocol.js";
import { nodeRpcPort } from "./ports.js";
import { createRpc } from "./rpc.js";
import { runCoreHost } from "./run.js";

const init: CoreInit = {
  dataDir: "/tmp/kickoff-core-test",
  port: 4999,
  staticDir: null,
  terminalEnv: { KICKOFF_TERMINAL_OF: "development" },
  speechHelper: "/x/kickoff-speech",
  hostPid: 4100,
  logsDir: "/tmp/kickoff-core-test-logs",
  hostStartedAt: 1000,
  recoveredReason: "crash",
};

/** 偽のコア（token・URL・close・バス・眠らせない理由・作業中のチャット・ターミナルだけ） */
function fakeCore() {
  const bus = new Bus();
  const state = { closed: 0, running: 0, closedOwners: [] as string[] };
  const core = {
    port: 4999,
    token: "tok",
    localUrl: "http://127.0.0.1:4999",
    bus,
    databaseStats: () => ({}) as never,
    browserLoginUrl: () => "",
    awakeNeeds: () => ({ running: state.running, mobileEnabled: false }),
    runningChats: () => [{ id: 7, title: "作業中" }],
    terminals: { closeOwnedBy: (owner: string) => void state.closedOwners.push(owner) } as never,
    close: async () => void state.closed++,
  } satisfies Core;
  return { core, state, bus };
}

/** メインの側（偽）とコアの側をつないで動かす */
function start(startCore: (opts: CoreOptions) => Promise<Core>) {
  const { port1, port2 } = new MessageChannel();
  afterTest(() => {
    port1.close();
    port2.close();
  });
  const hostPort = nodeRpcPort(port1);
  const exits: number[] = [];
  const messages: unknown[] = [];
  hostPort.onMessage((m) => messages.push(m));
  const events: { name: string; payload: unknown }[] = [];
  const host = createRpc<HostMethods, CoreMethods, HostEvents, CoreEvents>(hostPort, {
    handlers: {
      "secret.decrypt": async (sealed: string) => `plain:${sealed}`,
    } as never,
  });
  for (const name of ["children", "awake", "notify", "stall", "browser.touch"] as const) host.on(name, (payload) => events.push({ name, payload }));
  let platformInit: CoreInit | null = null;
  const platform = (i: CoreInit) => {
    platformInit = i;
    return { startShellPath: () => ({ ready: Promise.resolve() }) } as unknown as HostPlatform;
  };
  const done = runCoreHost(nodeRpcPort(port2), { startCore, platform, now: () => 5000, exit: (code) => void exits.push(code), timings: { processStart: 1100, modulesLoaded: 1200 }, awakeRecheckMs: 20 });
  return { hostPort, host, port1, exits, messages, events, done, platformInit: () => platformInit };
}

test("runCoreHost: init を受けて startCore に渡し、ready で token・URL・pid・起動の時刻を返す。子プロセスと眠らせない理由の知らせが届く", async () => {
  const fake = fakeCore();
  let received: CoreOptions | null = null;
  const run = start(async (opts) => {
    received = opts;
    opts.onStage?.("dbOpened");
    opts.onChildProcess?.({ pid: 77, group: false, kind: "agent", state: "started" });
    return fake.core;
  });
  run.hostPort.post({ t: "init", init });
  await until(() => run.messages.some((m) => (m as { t: string }).t === "ready"));
  const ready = run.messages.find((m) => (m as { t: string }).t === "ready") as { ready: { token: string; localUrl: string; pid: number; timings: Record<string, number> } };
  assert.equal(ready.ready.token, "tok");
  assert.equal(ready.ready.localUrl, "http://127.0.0.1:4999");
  assert.equal(ready.ready.pid, process.pid);
  assert.deepEqual(ready.ready.timings, { processStart: 1100, modulesLoaded: 1200, dbOpened: 5000, listening: 5000 });
  const opts = received as unknown as CoreOptions;
  assert.equal(opts.hostPid, 4100);
  assert.equal(opts.recoveredReason, "crash");
  assert.equal(opts.staticDir, undefined);
  assert.equal(run.platformInit()?.speechHelper, "/x/kickoff-speech");
  // メインにしかない口は RPC を通る（キーチェーンの鍵）
  assert.equal(await opts.secretCipher!.decrypt("abc"), "plain:abc");
  await until(() => run.events.some((e) => e.name === "children") && run.events.some((e) => e.name === "awake"));
  assert.deepEqual(run.events.find((e) => e.name === "children")?.payload, { pid: 77, group: false, kind: "agent", state: "started" });
  assert.deepEqual(run.events.find((e) => e.name === "awake")?.payload, { running: 0, mobileEnabled: false });
  // 作業中の数が変わったときだけ、もう一度知らせる
  fake.state.running = 1;
  fake.bus.publish({ type: "settings" } as never);
  fake.bus.publish({ type: "settings" } as never);
  await until(() => run.events.filter((e) => e.name === "awake").length === 2);
  // 作業の終わりの知らせのあとで作業中の数が減っても（知らせがなくても）、作業中の間は読み直して知らせる
  fake.state.running = 0;
  await until(() => run.events.filter((e) => e.name === "awake").length === 3);
  assert.deepEqual(run.events.filter((e) => e.name === "awake")[2]?.payload, { running: 0, mobileEnabled: false });
  // メインからの呼び出し
  assert.equal(await run.host.call("ping"), 5000);
  await run.host.call("terminal.closeOwnedBy", "wc:3");
  assert.deepEqual(fake.state.closedOwners, ["wc:3"]);
  // 終了してよいかを聞くダイアログの名前
  assert.deepEqual(await run.host.call("runningChats"), [{ id: 7, title: "作業中" }]);
  // close を頼むと、答えてから片付けて終わる
  await run.host.call("close");
  await until(() => run.exits.length === 1);
  assert.equal(fake.state.closed, 1);
  assert.deepEqual(run.exits, [0]);
});

test("runCoreHost: startCore が失敗したら failed を返して終わる（作り直さない）", async () => {
  const run = start(async () => {
    throw new Error("ポート 4999 は使われています");
  });
  run.hostPort.post({ t: "init", init });
  await run.done;
  await until(() => run.messages.length > 0);
  assert.deepEqual(run.messages.at(-1), { t: "failed", message: "ポート 4999 は使われています" });
  assert.deepEqual(run.exits, [1]);
});

test("runCoreHost: 親の口が閉じたら（メインが消えた）、片付けて終わる", async () => {
  const fake = fakeCore();
  const run = start(async () => fake.core);
  run.hostPort.post({ t: "init", init });
  await until(() => run.messages.some((m) => (m as { t: string }).t === "ready"));
  run.port1.close();
  await until(() => run.exits.length === 1);
  assert.equal(fake.state.closed, 1);
  assert.deepEqual(run.exits, [0]);
});
