// 定期の取り直し（PR の見張り・使用枠・ゴミ箱の片付け・自動のアーカイブなど）。間隔ごとに run を流し、すぐ取り直す refresh も受ける
import type { Clock, TimerHandle } from "@/foundation/core/clock";

export interface Poller {
  /** 間隔ごとに流し始める（runAtStart ならすぐ 1 回。もう始めていれば何もしない） */
  start(): void;
  /** 止める（流している途中の 1 回は最後まで流す） */
  stop(): void;
  /** すぐ取り直す（流している途中ならその 1 回を待つ。minGapMs 以内に流したばかりなら流さない = 続けての頼みをまとめる） */
  refresh(): Promise<void>;
  /** 始めてから止めるまで */
  readonly running: boolean;
}

export interface PollerOptions {
  intervalMs: number;
  /** この間に続けて来た refresh は 1 回にまとめる（流し始めた時刻から数える。既定 0 = まとめない） */
  minGapMs?: number;
  runAtStart?: boolean;
  run: () => Promise<void>;
  clock: Clock;
  /** run の失敗（既定は捨てる。定期の取り直しは次の回でやり直す） */
  onError?: (e: unknown) => void;
}

export function createPoller(opts: PollerOptions): Poller {
  const { clock } = opts;
  let timer: TimerHandle | null = null;
  /** 流している途中の 1 回（同時には 1 回だけ流す） */
  let inflight: Promise<void> | null = null;
  /** 最後に流し始めた時刻 */
  let lastAt: number | null = null;
  const runOnce = (): Promise<void> => {
    lastAt = clock.now();
    const current = (async () => {
      try {
        await opts.run();
      } catch (e) {
        opts.onError?.(e);
      } finally {
        inflight = null;
      }
    })();
    inflight = current;
    return current;
  };
  const tick = () => {
    if (!inflight) void runOnce();
  };
  return {
    start() {
      if (timer) return;
      timer = clock.setInterval(tick, opts.intervalMs);
      if (opts.runAtStart) tick();
    },
    stop() {
      clock.clearInterval(timer);
      timer = null;
    },
    refresh() {
      if (inflight) return inflight;
      const gap = opts.minGapMs ?? 0;
      if (gap > 0 && lastAt !== null && clock.now() - lastAt < gap) return Promise.resolve();
      return runOnce();
    },
    get running() {
      return timer !== null;
    },
  };
}
