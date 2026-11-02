import { useCallback, useMemo } from "react";
import type { Run } from "../../core/types";
import { chatTitle } from "./chatTitle";

/**
 * チャットを名前で絞り込む（ボード・サイドバーの検索欄。⌘F）。
 * チャットの中のやり取りの全文検索は、別のパネル（⌘⇧F）で行う。
 * matches は検索語が変わるまで同じ関数なので、絞り込みの useMemo の依存に使える
 */
export function useChatSearch(query: string) {
  const keyword = query.trim();
  const lower = keyword.toLowerCase();
  /** 検索語がなければすべて一致 */
  const matches = useCallback((run: Run) => !lower || chatTitle(run.title).toLowerCase().includes(lower), [lower]);
  return useMemo(() => ({ keyword, matches }), [keyword, matches]);
}

/** チャットの中の文言の全文検索（⌘⇧F のパネル）を開く */
export const OPEN_CONTENT_SEARCH_EVENT = "kickoff:open-content-search";
export function openContentSearch() {
  window.dispatchEvent(new Event(OPEN_CONTENT_SEARCH_EVENT));
}
