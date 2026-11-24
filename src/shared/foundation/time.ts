// 待ちの補助（決めた時間だけ待つ・決めた時間で打ち切る）と、ms 後の予約・時刻の口。メイン・コアの機能・画面で同じものを使う

/** ms 後の予約（取り消す関数を返す）と時刻の口。時間に頼る create*(deps)・関数が受ける（テストは @shared/foundation/testing/fakeScheduler） */
export interface Timers {
  timer(fn: () => void, ms: number): () => void;
  now(): number;
}

/** 本物の Timers（setTimeout と Date.now） */
export const realTimers: Timers = {
  timer: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
  now: () => Date.now(),
};

/** ms だけ待つ */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** promise が ms のうちに終わらなければ message のエラーにする（終わったらタイマーを片付ける） */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string, timers: Pick<Timers, "timer"> = realTimers): Promise<T> {
  let cancel: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    cancel = timers.timer(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => cancel?.());
}
