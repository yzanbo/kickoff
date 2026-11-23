import { useEffect, useRef, useState } from "react";
import type { GitHubItemPage, GitHubListFilter } from "@shared/github/types";
import { errorMessage } from "@shared/foundation/errors";
import { api } from "@/foundation/ui/api";
import { errorText, useCursorPages, useQuery } from "@/foundation/ui/query";
import { freshItemNumbers, GITHUB_FRESH_MS } from "./githubFresh";
import { githubRefresh } from "./githubRefresh";

const NO_FRESH: ReadonlySet<number> = new Set();

/**
 * GitHub タブの一覧。絞り込みを変えた・開いた・取り直しのボタン・窓に戻った・1 分ごとに GitHub に聞く。
 * 聞いている間は、前に取った一覧を「更新中」の印を付けて出しておく。古い頼みの答えは捨てる。
 * 同じ絞り込みで取り直して新しくなった行（更新された・新しく入った）は、少しの間だけ fresh に入れる（行に色を付ける）
 */
export function useGitHubList(projectId: number, filter: GitHubListFilter) {
  // 取り直しのボタンは、コアの覚えを使わずに聞き直す
  const force = useRef(false);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(NO_FRESH);
  // 出している同じ絞り込みの一覧（続きも足したもの。取り直しの答えと比べる）
  const shown = useRef<GitHubItemPage | null>(null);

  useEffect(() => {
    if (fresh.size === 0) return;
    const timer = setTimeout(() => setFresh(NO_FRESH), GITHUB_FRESH_MS);
    return () => clearTimeout(timer);
  }, [fresh]);

  const list = useQuery<GitHubItemPage>(
    ["github.items", projectId, JSON.stringify(filter)],
    async (signal) => {
      const refresh = force.current;
      force.current = false;
      const page = await api.githubItems(projectId, filter, { refresh });
      const changed = signal.aborted ? [] : freshItemNumbers(shown.current?.items ?? null, page.items);
      if (changed.length > 0) setFresh(new Set(changed));
      return page;
    },
    { keepPrevious: true, ...githubRefresh() },
  );
  useEffect(() => {
    shown.current = list.stale ? null : (list.data ?? null);
  });
  const pages = useCursorPages(list, (cursor) => api.githubItems(projectId, filter, { cursor }), (a, b) => a.number === b.number);

  return {
    page: list.data ?? null,
    error: errorText(list.error) ?? (pages.moreError ? errorMessage(pages.moreError) : null),
    loading: list.loading,
    loadingMore: pages.loadingMore,
    fresh,
    refresh: () => {
      force.current = true;
      void list.reload();
    },
    loadMore: pages.loadMore,
  };
}
