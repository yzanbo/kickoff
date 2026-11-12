// メモをチャットの入力欄に添付するときの形（純粋関数）: 選択部分は出どころ付きの引用（メモ全体は api.memoSnapshot で付けたときの写しを添付にする）
import { quoteComment } from "@/features/chat/messages/quoteComment";

/** 選んだ範囲の行（1 から数える。1 行の中なら from と to は同じ） */
export interface MemoLines {
  from: number;
  to: number;
}

/** メモの選択部分の引用（どこから引いたか（`@/lib/pathCopy` の lineLocation。AI がファイルを開いて前後も読めるように）を 1 行目に書く） */
export function memoQuote(location: string, selection: string): string {
  return `メモ「${location}」から:\n${quoteComment(selection, "")}`;
}
