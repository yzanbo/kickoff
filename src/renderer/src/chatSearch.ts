import type { Run } from "../../core/types";
import { chatTitle } from "./chatTitle";

/**
 * チャットを名前で絞り込む（ボード・サイドバーの検索欄。⌘F）。
 * チャットの中のやり取りの全文検索は、別のパネル（⌘⇧F）で行う
 */
export function useChatSearch(query: string) {
  const keyword = query.trim();
  const lower = keyword.toLowerCase();
  /** 検索語がなければすべて一致 */
  const matches = (run: Run) => !keyword || chatTitle(run.title).toLowerCase().includes(lower);
  return { keyword, matches };
}

/** チャットの中の文言の全文検索（⌘⇧F のパネル）を開く */
export const OPEN_CONTENT_SEARCH_EVENT = "kickoff:open-content-search";
export function openContentSearch() {
  window.dispatchEvent(new Event(OPEN_CONTENT_SEARCH_EVENT));
}
