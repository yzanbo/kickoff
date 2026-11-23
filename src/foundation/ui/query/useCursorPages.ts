import { useState } from "react";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { toError } from "./queryState";
import type { QueryResult } from "./useQuery";

/** 続きのある一覧の 1 回分（cursor は続きを読む印。なければ終わり） */
export interface CursorPage<I> {
  items: I[];
  cursor: string | null;
}

/** 続きの分を後ろに足す（すでにある行は足さない）。cursor は続きの分のもの */
export function appendPage<I, P extends CursorPage<I>>(page: P, more: CursorPage<I>, same: (a: I, b: I) => boolean): P {
  return { ...page, items: [...page.items, ...more.items.filter((i) => !page.items.some((x) => same(x, i)))], cursor: more.cursor };
}

/** 続きの答えを使うか: 頼んだときの一覧のままで、1 ページ目を取り直していない（絞り込みを変えた・取り直した間に届いた答えは捨てる） */
export const moreApplies = (base: unknown, now: { data: unknown; loading: boolean }): boolean => now.data === base && !now.loading;

/**
 * useQuery で取った 1 ページ目に、続き（cursor）を足していく。1 ページ目を取り直したら、足した分は答えに置き換わる。
 * 続きを読んでいる途中に絞り込みを変えた・取り直したら、続きの答えは捨てる
 */
export function useCursorPages<I, P extends CursorPage<I>>(query: QueryResult<P>, fetchMore: (cursor: string) => Promise<CursorPage<I>>, same: (a: I, b: I) => boolean) {
  // base: 続きを頼んだときの一覧（1 ページ目が置き換わったら、読んでいる印も失敗も出さない）
  const [more, setMore] = useState<{ base: P; error: Error | null } | null>(null);
  const now = useLatest(query);
  const current = more !== null && more.base === query.data ? more : null;
  const loadMore = () => {
    const base = query.data;
    if (!base?.cursor || (current && !current.error)) return;
    setMore({ base, error: null });
    fetchMore(base.cursor).then(
      (next) => {
        if (!moreApplies(base, now.current)) return;
        setMore(null);
        now.current.setData(appendPage(base, next, same));
      },
      (e: unknown) => moreApplies(base, now.current) && setMore({ base, error: toError(e) }),
    );
  };
  return { loadingMore: current !== null && !current.error, moreError: current?.error ?? null, loadMore };
}
