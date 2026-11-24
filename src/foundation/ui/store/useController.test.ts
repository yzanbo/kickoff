import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { test } from "vitest";
import { createFakeScheduler, type FakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { useController } from "./index";
import { createEntry, disposeEntry, nextEntry, type Controller } from "./useController";

/** 1 秒ごとに数を進める操る物（時計は偽物。dispose で止まる） */
function createTicker(clock: FakeScheduler, start: number): Controller<number> & { stops: number } {
  let count = start;
  const listeners = new Set<() => void>();
  let cancel = clock.timer(function tick() {
    count++;
    listeners.forEach((l) => l());
    cancel = clock.timer(tick, 1000);
  }, 1000);
  const ticker = {
    stops: 0,
    get: () => count,
    subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
    dispose: () => {
      ticker.stops++;
      cancel();
    },
  };
  return ticker;
}

test("useController の中身: 同じ deps なら作り直さず、deps が変わったら作り直す", () => {
  const clock = createFakeScheduler();
  let made = 0;
  const factory = (start: number) => () => (made++, createTicker(clock, start));
  const first = createEntry(factory(0), [1]);
  assert.equal(nextEntry(first, [1], factory(0)), first);
  const second = nextEntry(first, [2], factory(10));
  assert.notEqual(second, first);
  assert.equal(second.controller.get(), 10);
  assert.equal(made, 2);
});

test("useController の中身: dispose すると時計が止まり、2 回呼んでも 1 回だけ。後片付けしたものは nextEntry で作り直さない（付け直しで作る）", () => {
  const clock = createFakeScheduler();
  const entry = createEntry(() => createTicker(clock, 0), []);
  clock.advance(2000);
  assert.equal(entry.controller.get(), 2);
  disposeEntry(entry);
  disposeEntry(entry);
  clock.advance(5000);
  assert.deepEqual([entry.controller.get(), entry.controller.stops, clock.pending.timers], [2, 1, 0]);
  assert.equal(nextEntry(entry, [1], () => createTicker(clock, 0)), entry);
});

test("useController: 最初の描画から、作った物とその状態を返す", () => {
  const clock = createFakeScheduler();
  let seen: [number, Controller<number>] | undefined;
  const Probe = () => {
    seen = useController(() => createTicker(clock, 7), []);
    return null;
  };
  renderToString(createElement(Probe));
  assert.equal(seen?.[0], 7);
  assert.equal(seen?.[1].get(), 7);
});
