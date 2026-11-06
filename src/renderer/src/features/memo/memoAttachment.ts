// メモをメインのチャットの入力欄に添付するときの形（純粋関数）: メモ全体はメモの添付（Attachment の memo）、選んだ部分は出どころ付きの引用
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

/** メモのファイルの場所: フルパスと行番号（AI がファイルを開いて前後も読めるように。行が分からなければパスだけ） */
export function memoLocation(file: string, lines: MemoLines | null): string {
  if (!lines) return file;
  return lines.from === lines.to ? `${file}:${lines.from}` : `${file}:${lines.from}-${lines.to}`;
}

/** メモの選んだ部分の引用（どこから引いたか（memoLocation）を 1 行目に書く） */
export function memoQuote(location: string, selection: string): string {
  return `メモ「${location}」から:\n${quoteComment(selection, "")}`;
}
