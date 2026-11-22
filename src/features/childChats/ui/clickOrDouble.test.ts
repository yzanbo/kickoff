import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { createClickOrDouble } from "./clickOrDouble";

const setup = () => {
  const clock = createFakeScheduler();
  const log: string[] = [];
  const gate = createClickOrDouble(clock);
  const press = (detail: number) => gate.press(detail, () => log.push("click"), () => log.push("double"));
  return { clock, log, gate, press };
};

test("1 回押しは 300ms 待ってから・キーで押したらすぐ", () => {
  const { clock, log, press } = setup();
  press(1);
  clock.advance(299);
  assert.deepEqual(log, []);
  clock.advance(1);
  assert.deepEqual(log, ["click"]);
  press(0);
  assert.deepEqual(log, ["click", "click"]);
});

test("ダブルクリックは待っている 1 回押しを捨てる・消えたら移らない", () => {
  const { clock, log, gate, press } = setup();
  press(1);
  press(2);
  clock.advance(1000);
  assert.deepEqual(log, ["double"]);
  press(1);
  gate.cancel();
  clock.advance(1000);
  assert.deepEqual(log, ["double"]);
});
