import assert from "node:assert/strict";
import { test } from "node:test";
import { initialVad, LISTEN_VAD, vadStep, vadThreshold, type VadEvent, type VadOptions, type VadState } from "./vad";

/** 50ms ごとの音量を順に渡し、起きたことを時刻と一緒に返す */
function run(levels: number[], opts: VadOptions = LISTEN_VAD, start: VadState = initialVad(0)) {
  let state = start;
  const events: [number, VadEvent][] = [];
  levels.forEach((level, i) => {
    const r = vadStep(state, level, i * 50, opts);
    state = r.state;
    if (r.event) events.push([i * 50, r.event]);
  });
  return { state, events };
}

const quiet = (n: number) => Array<number>(n).fill(0.003);
const voice = (n: number) => Array<number>(n).fill(0.1);

test("声の見分け: 150ms 続いたら話し始め、1.5 秒黙ったら話し終わり", () => {
  const { events, state } = run([...quiet(4), ...voice(10), ...quiet(40)]);
  assert.deepEqual(events, [
    [350, "start"],
    [2200, "end"],
  ]);
  assert.equal(state.heard, true);
  assert.equal(state.speaking, false);
});

test("声の見分け: 短い物音では始めず、話している途中の短い間では終わらない", () => {
  assert.deepEqual(run([...quiet(4), ...voice(2), ...quiet(10)]).events, []);
  const { events } = run([...voice(5), ...quiet(10), ...voice(5), ...quiet(40)]);
  assert.deepEqual(
    events.map((e) => e[1]),
    ["start", "end"],
  );
});

test("声の見分け: まわりがうるさいと、声とみなす音量を上げる（下限は floor）", () => {
  const noisy = run(Array<number>(200).fill(0.02)).state;
  assert.ok(vadThreshold(noisy, LISTEN_VAD) > 0.05);
  assert.equal(vadThreshold(initialVad(0, 0), LISTEN_VAD), LISTEN_VAD.floor);
  // 雑音より少し大きいだけでは始まらない
  assert.deepEqual(run(Array<number>(10).fill(0.04), LISTEN_VAD, noisy).events, []);
});

test("声の見分け: 息つぎの短い間だけで 30 秒話し続けても、途中で話し終わりにしない", () => {
  // 1 秒話して 0.2 秒の息つぎ、を 25 回
  const talk = Array.from({ length: 25 }, () => [...voice(20), ...quiet(4)]).flat();
  const { events } = run([...quiet(4), ...talk, ...quiet(40)]);
  assert.deepEqual(
    events.map((e) => e[1]),
    ["start", "end"],
  );
  assert.ok(events[1][0] > 30_000);
});
