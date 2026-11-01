import { useEffect, useState } from "react";

/** ms ごとに描き直す（「5分前」・リセットまでの残りなど、時間とともに変わる表示を進める） */
export function useTicker(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(timer);
  }, [ms]);
}
