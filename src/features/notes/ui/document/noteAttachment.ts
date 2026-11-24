// ノートをチャットの入力欄に追加するときの形（純粋関数）: 選択部分は出どころ付きの引用（ノート全体は note/snapshot で付けたときの写しを添付にする）
import { quoteComment } from "@/features/chat/ui";

/** 選んだ範囲の行（1 から数える。1 行の中なら from と to は同じ） */
export interface NoteLines {
  from: number;
  to: number;
}

/** ノートの選択部分の引用（どこから引いたか（`@/lib/pathCopy` の lineLocation。AI がファイルを開いて前後も読めるように）を 1 行目に書く） */
export function noteQuote(location: string, selection: string): string {
  return `ノート「${location}」から:\n${quoteComment(selection, "")}`;
}
