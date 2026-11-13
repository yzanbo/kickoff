import assert from "node:assert/strict";
import { test } from "node:test";
import type { StreamResult } from "../system/stream.js";
import { until } from "../testing/testCore.js";
import { DockerEvents } from "./events.js";

/** 偽の docker: events は止めるか end() まで終わらない。エンジンが動いているかは up で決める */
function fakeCli() {
  const streams: { end: (r: StreamResult) => void }[] = [];
  const state = { up: true, engineChecks: 0 };
  const cli = {
    stream: () => {
      let end!: (r: StreamResult) => void;
      const done = new Promise<StreamResult>((resolve) => (end = resolve));
      streams.push({ end });
      return { done, stop: () => end({ code: null, stderrTail: "", stopped: true }) };
    },
    engineUp: async () => {
      state.engineChecks++;
      return state.up;
    },
  };
  return { cli, streams, state };
}

test("DockerEvents: エンジンが止まったら知らせ、戻るまで調べ直し、戻ったら知らせて docker events を立て直す", async () => {
  const { cli, streams, state } = fakeCli();
  const changes: number[][] = [];
  const events = new DockerEvents(cli, (ids) => changes.push(ids), { enginePollMs: 10 });
  events.lease(7);
  assert.equal(streams.length, 1);
  assert.equal(events.running, true);

  // エンジンが止まった（docker events が自分で終わった）
  state.up = false;
  streams[0].end({ code: 1, stderrTail: "Cannot connect to the Docker daemon", stopped: false });
  await until(() => changes.length === 1);
  assert.deepEqual(changes[0], [7]);
  assert.equal(events.running, false);
  // 止まっている間は調べ直し続け、立て直さない
  await until(() => state.engineChecks >= 2);
  assert.equal(streams.length, 1);

  // 戻った
  state.up = true;
  await until(() => streams.length === 2);
  assert.equal(events.running, true);
  assert.equal(changes.length, 2);
  events.stop();
});

test("DockerEvents: だれも見ていなければ止まったあとも調べ直さない・止めたときは立て直さない", async () => {
  const { cli, streams, state } = fakeCli();
  const events = new DockerEvents(cli, () => {}, { enginePollMs: 10 });
  events.lease(1);
  events.stop();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(streams.length, 1);
  assert.equal(state.engineChecks, 0);
});
