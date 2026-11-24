import { useEffect, useState } from "react";

/** 1 秒ごと（経過の秒・再開までの残り秒など） */
export const TICK_SECOND = 1000;
/** 動きの目安（「動きがありません」・最後の動きからの時間）を見直す間隔 */
export const TICK_ACTIVITY = 15_000;

/**
 * ms ごとに描き直す（「5分前」・リセットまでの残りなど、時間とともに変わる表示を進める）。null なら止める（作業中でないときなど）。
 * 時間で変わる値を出す部品だけで呼ぶ（App・画面全体の hook で呼ぶと、その下がすべて時計ごとに描き直る）
 */
export function useTicker(ms: number | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (ms === null) return;
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}
