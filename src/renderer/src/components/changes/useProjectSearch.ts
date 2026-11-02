import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectSearchQuery, ProjectSearchResult } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { useGitTarget } from "../../worktree/worktreeContext";

/** 打つのが止まってから探すまでの時間 */
const DEBOUNCE_MS = 300;

type SearchOption = "caseSensitive" | "wholeWord" | "regex";

/** プロジェクトのファイルの中を探す（VS Code の検索と同じく、打つと探し直す。表示を切り替えても残す） */
export function useProjectSearch(projectId: number) {
  const { target, key } = useGitTarget(projectId);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Record<SearchOption, boolean>>({ caseSensitive: false, wholeWord: false, regex: false });
  const [result, setResult] = useState<{ query: ProjectSearchQuery; value: ProjectSearchResult }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  const run = useCallback(
    async (search: ProjectSearchQuery) => {
      const request = ++latest.current;
      setLoading(true);
      try {
        const value = await api.searchProject(target, search);
        if (request !== latest.current) return;
        setResult({ query: search, value });
        setError(undefined);
      } catch (e) {
        if (request === latest.current) setError(errorMessage(e));
      } finally {
        if (request === latest.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const current: ProjectSearchQuery = { query, ...options };
  useEffect(() => {
    if (!query) {
      latest.current++;
      setResult(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => void run({ query, ...options }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, options, run]);

  return {
    query,
    setQuery,
    options,
    toggle: (key: SearchOption) => setOptions((prev) => ({ ...prev, [key]: !prev[key] })),
    /** 表示している結果と、そのときの探し方（印を付けるのに使う） */
    result,
    error,
    loading,
    rerun: () => query && void run(current),
  };
}

export type ProjectSearchController = ReturnType<typeof useProjectSearch>;
