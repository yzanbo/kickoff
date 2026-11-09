import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectSearchQuery, ProjectSearchResult } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useSetting } from "@/hooks/useSetting";
import { SEARCH_HISTORY } from "@/lib/storageKeys";
import { useGitTarget } from "@/features/worktree/worktreeContext";
import { lineKey, pushHistory, visibleResults, type DismissedResults } from "./searchHits";

/** 打つのが止まってから探すまでの時間 */
const DEBOUNCE_MS = 300;

type SearchOption = "case_sensitive" | "whole_word" | "regex" | "use_ignore";

/**
 * プロジェクトのファイルの中を探す（VS Code の検索と同じく、打つと探し直す。表示を切り替えても残す）。
 * 探し方の切り替え・含める / 除外するファイル（詳細）・置換の欄の中身・結果から外したもの・検索の履歴も持つ
 */
export function useProjectSearch(projectId: number) {
  const { target, key } = useGitTarget(projectId);
  const [query, setQueryState] = useState("");
  const [options, setOptions] = useState<Record<SearchOption, boolean>>({ case_sensitive: false, whole_word: false, regex: false, use_ignore: true });
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [replace, setReplace] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [preserveCase, setPreserveCase] = useState(false);
  const [result, setResult] = useState<{ query: ProjectSearchQuery; value: ProjectSearchResult }>();
  const [dismissed, setDismissed] = useState<DismissedResults>(new Set());
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useSetting(SEARCH_HISTORY);
  // 履歴をたどっている位置（-1 = 打っている文字）。打ったら戻す
  const historyIndex = useRef(-1);
  const latest = useRef(0);

  const run = useCallback(
    async (search: ProjectSearchQuery) => {
      const request = ++latest.current;
      setLoading(true);
      try {
        const value = await api.searchProject(target, search);
        if (request !== latest.current) return;
        setResult({ query: search, value });
        // 探し直したら、外したものは忘れる（VS Code と同じ）
        setDismissed(new Set());
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

  const current: ProjectSearchQuery = { query, ...options, include, exclude };
  useEffect(() => {
    if (!query) {
      latest.current++;
      setResult(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => void run({ query, ...options, include, exclude }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, options, include, exclude, run]);

  // 探した文字を履歴に残す（打っている途中の文字ではなく、結果が出たもの）
  const resultQuery = result?.query.query;
  useEffect(() => {
    if (resultQuery && historyIndex.current < 0) setHistory(pushHistory(history, resultQuery));
    // 結果が変わったときだけ（履歴が変わっても足し直さない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultQuery]);

  const files = useMemo(() => visibleResults(result?.value.files ?? [], dismissed), [result, dismissed]);

  return {
    query,
    setQuery: (next: string) => {
      historyIndex.current = -1;
      setQueryState(next);
    },
    options,
    toggle: (key: SearchOption) => setOptions((prev) => ({ ...prev, [key]: !prev[key] })),
    include,
    setInclude,
    exclude,
    setExclude,
    showDetails,
    setShowDetails,
    replace,
    setReplace,
    showReplace,
    setShowReplace,
    preserveCase,
    setPreserveCase,
    /** 表示している結果と、そのときの探し方（印・置換に使う） */
    result,
    /** 結果から外したものを除いたファイル */
    files,
    error,
    loading,
    rerun: () => query && void run(current),
    /** 結果からファイル（line なし）・行を外す */
    dismiss: (path: string, line?: number) => setDismissed((prev) => new Set(prev).add(line === undefined ? path : lineKey(path, line))),
    /** 検索の文字と結果を消す */
    clear: () => {
      historyIndex.current = -1;
      setQueryState("");
      setDismissed(new Set());
    },
    /** 入力欄の ↑（older）・↓ で履歴をたどる。たどれなければ false */
    stepHistory: (older: boolean): boolean => {
      const next = historyIndex.current + (older ? 1 : -1);
      if (next < -1 || next >= history.length) return false;
      historyIndex.current = next;
      setQueryState(next < 0 ? "" : history[next]);
      return true;
    },
    /** フォルダーの中だけを探す（ファイルの木の右クリック。含めるファイルにフォルダーを入れ、詳細を開く） */
    findInFolder: (folder: string) => {
      setInclude(`./${folder}/`);
      setShowDetails(true);
    },
  };
}

export type ProjectSearchController = ReturnType<typeof useProjectSearch>;
