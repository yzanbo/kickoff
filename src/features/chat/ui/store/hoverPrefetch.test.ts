import assert from "node:assert/strict";
import { test } from "vitest";
import { createFakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { createHoverPrefetch, HOVER_PREFETCH_MS, prefetchTargetOf } from "./hoverPrefetch";

/** closest で決まった要素を返すだけの偽の要素（DOM の環境がないため） */
const el = (dataset: Record<string, string> | null) => ({ closest: () => (dataset ? { dataset } : null) }) as unknown as Element;

test("乗せた要素から先読みするチャットを読む", () => {
  assert.equal(prefetchTargetOf(el({ prefetchChat: "12" })), 12);
  assert.equal(prefetchTargetOf(el({ prefetchChat: "7", chatId: "12" })), 7);
  assert.equal(prefetchTargetOf(el({ prefetchChat: "x" })), null);
  assert.equal(prefetchTargetOf(el(null)), null);
  assert.equal(prefetchTargetOf(null), null);
});

test("乗せて HOVER_PREFETCH_MS たったら先読みし、通り過ぎたものは読まない", () => {
  const clock = createFakeScheduler();
  const read: number[] = [];
  const hover = createHoverPrefetch({ timer: clock.timer, prefetch: (id) => read.push(id) });
  hover.over(el({ prefetchChat: "1" }));
  hover.over(el({ prefetchChat: "2" }));
  assert.equal(clock.pending.timers, 1);
  clock.advance(HOVER_PREFETCH_MS - 1);
  // 同じチャットの中を動いても数え直さない
  hover.over(el({ prefetchChat: "2" }));
  assert.equal(clock.pending.timers, 1);
  assert.deepEqual(read, []);
  clock.advance(1);
  assert.deepEqual(read, [2]);
  hover.over(el(null));
  hover.over(el({ prefetchChat: "3" }));
  hover.over(null);
  assert.equal(clock.pending.timers, 0);
  assert.deepEqual(read, [2]);
});
