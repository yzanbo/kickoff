import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useFindOptions } from "@/hooks/useFindOptions";
import { findPattern, spansIn, stepMatch, type TextSpan } from "@/lib/textFind";
import type { LogRow } from "./dockerLogView";

/**
 * ログの画面の ⌘F: 並べている行（札・エラーの絞り込みのあと）の文（色の印を外したもの）から探す。
 * 行の ID ごとの見つけた所と、いま選んでいる所（↑↓ で前後へ。端で回り込む）を返す。探し方の「Aa」「ab」「.*」はほかの検索の欄と同じ値
 */
export function useDockerLogFind(rows: LogRow[], textOf: (row: LogRow) => string) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { options, toggle } = useFindOptions();
  const needle = useDeferredValue(open ? query : "");
  const pattern = useMemo(() => findPattern(needle, options), [needle, options]);
  const invalid = pattern !== null && "error" in pattern;
  /** 行の ID → 見つけた所（見つけた行だけ）と、前から並べた一致 */
  const { marks, matches } = useMemo(() => {
    const marks = new Map<number, TextSpan[]>();
    const matches: { id: number; nth: number }[] = [];
    if (!pattern || "error" in pattern) return { marks, matches };
    for (const row of rows) {
      const spans = spansIn(textOf(row), pattern);
      if (spans.length === 0) continue;
      marks.set(row.id, spans);
      spans.forEach((_, nth) => matches.push({ id: row.id, nth }));
    }
    return { marks, matches };
  }, [rows, pattern, textOf]);
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => setIndex(null), [pattern]);
  const current = index !== null ? (matches[index] ?? null) : null;
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    setOpen(false);
    setIndex(null);
  }, []);
  const count = matches.length;
  const step = useCallback((dir: 1 | -1) => setIndex((i) => stepMatch(i, count, dir)), [count]);

  return {
    open,
    query,
    setQuery,
    options,
    toggle,
    invalid,
    needle,
    marks,
    matches,
    index,
    current,
    /** 欄を開く（前に打った文は残す） */
    show,
    close,
    step,
  };
}
