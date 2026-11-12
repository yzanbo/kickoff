import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubItemPage, GitHubListFilter } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { useGitHubRefresh } from "./useGitHubRefresh";

interface ListState {
  page: GitHubItemPage | null;
  error: string | null;
  /** GitHub に聞いている最中（前の一覧は「更新中」の印を付けて出したまま） */
  loading: boolean;
  /** 続きを読んでいる最中 */
  loadingMore: boolean;
}

/**
 * GitHub タブの一覧。絞り込みを変えた・開いた・取り直しのボタン・窓に戻った・1 分ごとに GitHub に聞く。
 * 聞いている間は、前に取った一覧を「更新中」の印を付けて出しておく（要件 5.11）。古い頼みの答えは捨てる
 */
export function useGitHubList(projectId: number, filter: GitHubListFilter, active: boolean) {
  const [state, setState] = useState<ListState>({ page: null, error: null, loading: true, loadingMore: false });
  const seq = useRef(0);
  const filterKey = JSON.stringify(filter);
  const current = useRef({ projectId, filter });
  current.current = { projectId, filter };

  const load = useCallback((refresh: boolean) => {
    const id = ++seq.current;
    const { projectId: p, filter: f } = current.current;
    setState((s) => ({ ...s, loading: true }));
    api.githubItems(p, f, { refresh }).then(
      (page) => id === seq.current && setState({ page, error: null, loading: false, loadingMore: false }),
      (e: unknown) => id === seq.current && setState((s) => ({ ...s, error: errorMessage(e), loading: false, loadingMore: false })),
    );
  }, []);

  useEffect(() => {
    if (active) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, filterKey, active]);

  useGitHubRefresh(() => load(false), active);

  const loadMore = () => {
    const cursor = state.page?.cursor;
    if (!cursor || state.loadingMore) return;
    const id = seq.current;
    setState((s) => ({ ...s, loadingMore: true }));
    api.githubItems(projectId, filter, { cursor }).then(
      (more) =>
        id === seq.current &&
        setState((s) => ({
          ...s,
          loadingMore: false,
          page: s.page ? { ...s.page, items: [...s.page.items, ...more.items.filter((i) => !s.page?.items.some((x) => x.number === i.number))], cursor: more.cursor } : more,
        })),
      (e: unknown) => id === seq.current && setState((s) => ({ ...s, loadingMore: false, error: errorMessage(e) })),
    );
  };

  return { ...state, refresh: () => load(true), loadMore };
}
