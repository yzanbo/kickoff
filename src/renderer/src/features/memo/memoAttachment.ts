// メモをメインのチャットの入力欄に添付するときの形（純粋関数）: メモ全体はメモの添付（Attachment の memo）、選択部分は出どころ付きの引用
import { memoKindOf } from "@shared/memo/kinds";
import type { Attachment } from "@shared/types";
import { quoteComment } from "@/features/chat/messages/quoteComment";
import { baseName } from "./memoPaths";

/** メモ全体の添付（アップロードしない。送るときにコアがメモのファイルのパスを AI に伝える） */
export function memoAttachment(path: string): Attachment {
  return { id: crypto.randomUUID(), name: baseName(path), mime: memoKindOf(path) === "html" ? "text/html" : "text/markdown", size: 0, memo: path };
}

/** 選んだ範囲の行（1 から数える。1 行の中なら from と to は同じ） */
export interface MemoLines {
  from: number;
  to: number;
}

/** メモの選択部分の引用（どこから引いたか（`@/lib/pathCopy` の lineLocation。AI がファイルを開いて前後も読めるように）を 1 行目に書く） */
export function memoQuote(location: string, selection: string): string {
  return `メモ「${location}」から:\n${quoteComment(selection, "")}`;
}
