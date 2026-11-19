// テストで手で進める時計（Clock を満たす）。時刻とタイマーの順は createFakeScheduler（画面のテストと同じ偽の時計）に任せ、
// ここでは iso・setInterval・sleep・TimerHandle と、時刻に関係なく全部呼ぶ fireAll を足す
import { createFakeScheduler, type FakeScheduler } from "@shared/foundation/testing/fakeScheduler";
import { sleepWith, type Clock, type TimerHandle } from "@/foundation/core/clock";

export interface ManualClock extends Clock {
  /** 中の scheduler（画面のテストと同じ偽の時計を共有したいとき） */
  readonly scheduler: FakeScheduler;
  /** 時刻を ms 進め、その間に来るタイマーを時刻の順に呼ぶ（時刻が来るたびに約束を 1 回流す） */
  advance(ms: number): Promise<void>;
  /** 待っているタイマーを時刻に関係なく全部呼ぶ（呼んでいる間に予約したものは呼ばない） */
  fireAll(): void;
  /** 待っているタイマーの数 */
  readonly pending: number;
}

/** 予約 1 つ（setInterval は呼ぶたびに予約し直す） */
interface Timer {
  fn: () => void;
  /** 呼ぶ時刻 */
  at: number;
  /** 繰り返しの間隔（setTimeout は null） */
  every: number | null;
  /** scheduler の予約を外す */
  cancel: () => void;
}

/** 手で進める時計を作る（時刻は start から） */
export function manualClock(start = Date.parse("2026-01-01T00:00:00.000Z")): ManualClock {
  const scheduler = createFakeScheduler(start);
  /** 待っているタイマー（予約した順） */
  const timers = new Set<Timer>();
  const arm = (t: Timer, ms: number) => {
    t.at = scheduler.now() + ms;
    t.cancel = scheduler.timer(() => fire(t), ms);
  };
  const fire = (t: Timer) => {
    if (t.every === null) timers.delete(t);
    else arm(t, t.every);
    t.fn();
  };
  const add = (fn: () => void, ms: number, every: number | null) => {
    const t: Timer = { fn, at: 0, every, cancel: () => {} };
    timers.add(t);
    arm(t, ms);
    return t as unknown as TimerHandle;
  };
  const clear = (handle: TimerHandle | null | undefined) => {
    const t = handle as unknown as Timer | null | undefined;
    if (!t || !timers.has(t)) return;
    t.cancel();
    timers.delete(t);
  };
  const clock: ManualClock = {
    scheduler,
    now: () => scheduler.now(),
    iso: () => new Date(scheduler.now()).toISOString(),
    setTimeout: (fn, ms) => add(fn, ms, null),
    clearTimeout: clear,
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearInterval: clear,
    sleep: (ms, signal) => sleepWith(clock, ms, signal),
    async advance(ms) {
      const until = scheduler.now() + ms;
      for (;;) {
        let next = Infinity;
        for (const t of timers) next = Math.min(next, t.at);
        if (next > until) break;
        scheduler.advance(Math.max(0, next - scheduler.now()));
        await Promise.resolve();
      }
      scheduler.advance(until - scheduler.now());
    },
    fireAll() {
      for (const t of [...timers]) {
        if (!timers.has(t)) continue;
        t.cancel();
        fire(t);
      }
    },
    get pending() {
      return scheduler.pending.timers;
    },
  };
  return clock;
}
