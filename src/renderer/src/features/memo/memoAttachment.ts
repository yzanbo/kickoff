// メモをメインのチャットの入力欄に添付するときの形（純粋関数）: メモ全体はメモの添付（Attachment の memo）、選んだ部分は出どころ付きの引用
import { memoKindOf } from "@shared/memo/kinds";
import type { Attachment } from "@shared/types";
import { quoteComment } from "@/features/chat/messages/quoteComment";
import { baseName } from "./memoPaths";

/** メモ全体の添付（アップロードしない。送るときにコアがメモのファイルのパスを AI に伝える） */
export function memoAttachment(path: string): Attachment {
  return { id: crypto.randomUUID(), name: baseName(path), mime: memoKindOf(path) === "html" ? "text/html" : "text/markdown", size: 0, memo: path };
}

/** メモの選んだ部分の引用（どのメモから引いたかを 1 行目に書く） */
export function memoQuote(path: string, selection: string): string {
  return `メモ「${path}」から:\n${quoteComment(selection, "")}`;
}
