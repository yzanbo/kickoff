import { useEffect, useState } from "react";

/**
 * ms ごとに描き直す（「5分前」・リセットまでの残りなど、時間とともに変わる表示を進める）。
 * 時間で変わる値を出す部品だけで呼ぶ（App・画面全体の hook で呼ぶと、その下がすべて時計ごとに描き直る）
 */
export function useTicker(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}
