// メインプロセスの待ちの補助（決めた時間だけ待つ・決めた時間で打ち切る）

/** ms だけ待つ */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** promise が ms のうちに終わらなければ message のエラーにする（終わったらタイマーを片付ける） */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
