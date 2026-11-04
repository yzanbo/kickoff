import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeFrames, summarizeInteractions, type FrameEntry, type InteractionEntry } from "./rendererTiming.js";

const event = (name: string, duration: number, target = "textarea"): InteractionEntry => ({ name, duration, inputDelay: 0, processing: duration, presentation: 0, target });

test("性能の記録: 操作の遅れを、種類ごとの数と遅さ・遅かったものの上位にまとめる", () => {
  const events = [event("keydown", 24), event("keydown", 120), event("keydown", 40), event("click", 64, "button.btn")];
  const s = summarizeInteractions(events, 2);
  assert.equal(s.count, 4);
  assert.deepEqual(s.kinds, [
    { name: "keydown", count: 3, p50: 40, p90: 40, max: 120 },
    { name: "click", count: 1, p50: 64, p90: 64, max: 64 },
  ]);
  assert.deepEqual(
    s.slowest.map((e) => e.duration),
    [120, 64],
  );
  assert.deepEqual(summarizeInteractions([]), { count: 0, kinds: [], slowest: [] });
});

test("性能の記録: 長いフレームを合計し、時間を使ったスクリプトを場所と関数ごとにまとめる", () => {
  const script = (fn: string, duration: number, forcedLayout = 0) => ({ invoker: "EventTarget.onkeydown", source: "index.js:100", fn, duration, forcedLayout });
  const frames: FrameEntry[] = [
    { duration: 80, blocking: 30, styleLayout: 20, scripts: [script("render", 50, 10)] },
    { duration: 120, blocking: 70, styleLayout: 40, scripts: [script("render", 60), script("fit", 5)] },
  ];
  const s = summarizeFrames(frames, 1);
  assert.equal(s.count, 2);
  assert.equal(s.totalMs, 200);
  assert.equal(s.blockingMs, 100);
  assert.equal(s.styleLayoutMs, 60);
  assert.deepEqual(
    s.slowest.map((f) => f.duration),
    [120],
  );
  assert.deepEqual(s.topScripts[0], { invoker: "EventTarget.onkeydown", source: "index.js:100", fn: "render", count: 2, totalMs: 110, forcedLayoutMs: 10 });
  assert.equal(s.topScripts[1]?.fn, "fit");
});
