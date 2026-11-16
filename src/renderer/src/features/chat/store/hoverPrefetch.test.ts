import assert from "node:assert/strict";
import { test } from "vitest";
import { createHoverPrefetch, HOVER_PREFETCH_MS, prefetchTargetOf } from "./hoverPrefetch";

/** closest で決まった要素を返すだけの偽の要素（DOM の環境がないため） */
const el = (dataset: Record<string, string> | null) => ({ closest: () => (dataset ? { dataset } : null) }) as unknown as Element;

test("乗せた要素から先読みするチャットを読む", () => {
  assert.equal(prefetchTargetOf(el({ chatId: "12" })), 12);
  assert.equal(prefetchTargetOf(el({ prefetchChat: "7", chatId: "12" })), 7);
  assert.equal(prefetchTargetOf(el({ chatId: "x" })), null);
  assert.equal(prefetchTargetOf(el(null)), null);
  assert.equal(prefetchTargetOf(null), null);
});

test("乗せて HOVER_PREFETCH_MS たったら先読みし、通り過ぎたものは読まない", () => {
  const timers: { ms: number; fn: () => void }[] = [];
  const read: number[] = [];
  const hover = createHoverPrefetch({
    timer: (fn, ms) => {
      const t = { ms, fn };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
    prefetch: (id) => read.push(id),
  });
  hover.over(el({ chatId: "1" }));
  hover.over(el({ chatId: "2" }));
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, HOVER_PREFETCH_MS);
  // 同じチャットの中を動いても数え直さない
  hover.over(el({ chatId: "2" }));
  assert.equal(timers.length, 1);
  timers.shift()!.fn();
  assert.deepEqual(read, [2]);
  hover.over(el(null));
  hover.over(el({ chatId: "3" }));
  hover.over(null);
  assert.equal(timers.length, 0);
  assert.deepEqual(read, [2]);
});
