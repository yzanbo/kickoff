import { useCallback, useEffect, useRef, useState } from "react";
import type { GitHubItem, GitHubItemPage, GitHubListFilter } from "@shared/types";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { freshItemNumbers, GITHUB_FRESH_MS } from "./githubFresh";
import { useGitHubRefresh } from "./useGitHubRefresh";

interface ListState {
  page: GitHubItemPage | null;
  error: string | null;
  /** GitHub に聞いている最中（前の一覧は「更新中」の印を付けて出したまま） */
  loading: boolean;
  /** 続きを読んでいる最中 */
  loadingMore: boolean;
}

const NO_FRESH: ReadonlySet<number> = new Set();

/**
 * GitHub タブの一覧。絞り込みを変えた・開いた・取り直しのボタン・窓に戻った・1 分ごとに GitHub に聞く。
 * 聞いている間は、前に取った一覧を「更新中」の印を付けて出しておく（要件 5.11）。古い頼みの答えは捨てる。
 * 同じ絞り込みで取り直して新しくなった行（更新された・新しく入った）は、少しの間だけ fresh に入れる（仕様書 6。行に色を付ける）
 */
export function useGitHubList(projectId: number, filter: GitHubListFilter, active: boolean) {
  const [state, setState] = useState<ListState>({ page: null, error: null, loading: true, loadingMore: false });
  const seq = useRef(0);
  const filterKey = JSON.stringify(filter);
  const current = useRef({ projectId, filter });
  current.current = { projectId, filter };
  // 前に読んだ一覧（同じプロジェクト・絞り込みのときだけ比べる）
  const shown = useRef<{ key: string; items: GitHubItem[] } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(NO_FRESH);

  useEffect(() => {
    if (fresh.size === 0) return;
    const timer = setTimeout(() => setFresh(NO_FRESH), GITHUB_FRESH_MS);
    return () => clearTimeout(timer);
  }, [fresh]);

  const load = useCallback((refresh: boolean) => {
    const id = ++seq.current;
    const { projectId: p, filter: f } = current.current;
    const key = `${p}:${JSON.stringify(f)}`;
    setState((s) => ({ ...s, loading: true }));
    api.githubItems(p, f, { refresh }).then(
      (page) => {
        if (id !== seq.current) return;
        const changed = freshItemNumbers(shown.current?.key === key ? shown.current.items : null, page.items);
        shown.current = { key, items: page.items };
        if (changed.length > 0) setFresh(new Set(changed));
        setState({ page, error: null, loading: false, loadingMore: false });
      },
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
        setState((s) => {
          const page = s.page ? { ...s.page, items: [...s.page.items, ...more.items.filter((i) => !s.page?.items.some((x) => x.number === i.number))], cursor: more.cursor } : more;
          if (shown.current) shown.current = { ...shown.current, items: page.items };
          return { ...s, loadingMore: false, page };
        }),
      (e: unknown) => id === seq.current && setState((s) => ({ ...s, loadingMore: false, error: errorMessage(e) })),
    );
  };

  return { ...state, fresh, refresh: () => load(true), loadMore };
}
