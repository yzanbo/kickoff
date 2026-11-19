// 時計の口。時間に頼る処理（期限・まとめる・定期・待つ）はこれを受け、setTimeout・Date.now を直に書かない
// （テストは testing/manualClock.ts の手で進める時計を渡す。構造の検査が土台と chat のコアの直書きを数える）

declare const timerBrand: unique symbol;
/** タイマーの印（中身は時計ごとに違う。clearTimeout・clearInterval に返すだけ） */
export type TimerHandle = { readonly [timerBrand]: true };

export interface Clock {
  /** いまの時刻（ms。Date.now と同じ） */
  now(): number;
  /** いまの時刻の ISO 8601（new Date(now()).toISOString()） */
  iso(): string;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle | null | undefined): void;
  setInterval(fn: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle | null | undefined): void;
  /** ms 待つ（signal で止めたら AbortError） */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

/** clock のタイマーで ms 待つ（Clock.sleep の中身。signal で止めたらタイマーを外して AbortError） */
export function sleepWith(clock: Pick<Clock, "setTimeout" | "clearTimeout">, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("待つのを止めました", "AbortError"));
    const onAbort = () => {
      clock.clearTimeout(handle);
      reject(new DOMException("待つのを止めました", "AbortError"));
    };
    const handle = clock.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

type NodeTimer = ReturnType<typeof setTimeout>;
const nodeTimer = (handle: TimerHandle | null | undefined) => (handle ?? undefined) as unknown as NodeTimer | undefined;

/** 本物の時計（タイマーは unref する。プロセスの終わりを止めない） */
export const systemClock: Clock = {
  now: () => Date.now(),
  iso: () => new Date().toISOString(),
  setTimeout: (fn, ms) => setTimeout(fn, ms).unref() as unknown as TimerHandle,
  clearTimeout: (handle) => clearTimeout(nodeTimer(handle)),
  setInterval: (fn, ms) => setInterval(fn, ms).unref() as unknown as TimerHandle,
  clearInterval: (handle) => clearInterval(nodeTimer(handle)),
  sleep: (ms, signal) => sleepWith(systemClock, ms, signal),
};
