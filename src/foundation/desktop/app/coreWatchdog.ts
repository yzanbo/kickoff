// コアの応答の見張り: everyMs ごとに ping し、limitMs より長く答えなければ onSilent、答えたら onResponded を呼ぶ（様子を決めるのは呼ぶ側の coreStateAfter）
import { systemClock, type Clock, type TimerHandle } from "@/foundation/core/clock";

/** コアの応答の見張りの間隔と、知らせるまでの長さ（一時の重さ = 大きな SQL などで知らせない） */
export const CORE_PING_EVERY_MS = 5_000;
export const CORE_UNRESPONSIVE_MS = 30_000;

export interface Watchdog {
  start(): void;
  stop(): void;
  /** いま答えたものとして数え直す（起動・作り直しが済んだとき・利用者が「待つ」を選んだとき） */
  reset(): void;
}

export function createWatchdog(opts: {
  /** ping を送る（コアがない・終わる途中なら null で、その回は見ない） */
  ping: () => Promise<unknown> | null;
  everyMs: number;
  limitMs: number;
  onResponded: () => void;
  /** silentMs: 最後に答えてからの長さ */
  onSilent: (silentMs: number) => void;
  /** 時計（既定は本物） */
  clock?: Clock;
}): Watchdog {
  const clock = opts.clock ?? systemClock;
  let lastPong = clock.now();
  let timer: TimerHandle | null = null;
  const stop = () => {
    clock.clearInterval(timer);
    timer = null;
  };
  return {
    start() {
      stop();
      timer = clock.setInterval(() => {
        const pong = opts.ping();
        if (!pong) return;
        pong.then(
          () => {
            lastPong = clock.now();
            opts.onResponded();
          },
          () => {},
        );
        const silent = clock.now() - lastPong;
        if (silent > opts.limitMs) opts.onSilent(silent);
      }, opts.everyMs);
    },
    stop,
    reset: () => void (lastPong = clock.now()),
  };
}
