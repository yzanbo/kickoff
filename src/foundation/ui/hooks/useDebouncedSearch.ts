import { useEffect, useEffectEvent, useState } from "react";

/**
 * 打つのが止まってから（ms）探す。空の入力（前後の空白を除いて）は探さずに空にする。探している間は loading。
 * 古い入力の結果は捨てる（打ち直した・外した）。失敗は空の結果にする。key が変わっても探し直す（探す範囲を変えたときなど）
 */
export function useDebouncedSearch<T>(query: string, search: (query: string) => Promise<readonly T[]>, ms = 200, key?: unknown): { results: readonly T[]; loading: boolean } {
  const [results, setResults] = useState<readonly T[]>([]);
  const [loading, setLoading] = useState(false);
  const run = useEffectEvent((q: string) => search(q));
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      run(q)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false));
    }, ms);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, ms, key]);
  return { results, loading };
}
