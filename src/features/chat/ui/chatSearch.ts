import { useCallback, useMemo } from "react";
import type { Chat } from "@shared/chat/types";
import { chatTitle } from "./chatTitle";

/**
 * チャットを名前で絞り込む（ボード・サイドバーの検索欄。⌘F）。
 * チャットの中のやり取りの全文検索は、別のパネル（ボードの検索欄の横のボタン・⌘K の「チャット内の文言」）で行う。
 * matches は検索語が変わるまで同じ関数なので、絞り込みの useMemo の依存に使える
 */
export function useChatSearch(query: string) {
  const keyword = query.trim();
  const lower = keyword.toLowerCase();
  /** 検索語がなければすべて一致 */
  const matches = useCallback((chat: Chat) => !lower || chatTitle(chat.title).toLowerCase().includes(lower), [lower]);
  return useMemo(() => ({ keyword, matches }), [keyword, matches]);
}
