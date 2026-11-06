import type { MutableRefObject } from "react";
import { placeAbove, SelectionAttachBox } from "@/features/chat/messages/SelectionAttach";
import { attachMemoToChat } from "./attachMemo";
import type { HtmlMemoPageHandle } from "./HtmlMemoPage";
import { memoLocation, memoQuote } from "./memoAttachment";
import type { MemoEditorHandle } from "./MemoEditor";

/**
 * 右の欄・別ウィンドウのメモで文を選ぶと、その上に「チャットに添付」を出し、押すとすぐ開いたチャット（chatId）の入力欄に
 * 選んだ部分の引用（ファイルのフルパスと行番号付き。HTML のページは行が分からないのでパスだけ）を足す（AI の返答で選んだときと同じ）
 */
export function MemoSelectionAttach({
  chatId,
  file,
  path,
  editor,
  page,
}: {
  chatId: number;
  /** メモのファイルのフルパス */
  file: string;
  /** メモのフォルダからのパス */
  path: string;
  editor: MutableRefObject<MemoEditorHandle | null>;
  /** HTML のメモをページで見ているときの、ページを読む口（ソース・Markdown のときは null） */
  page: MutableRefObject<HtmlMemoPageHandle | null> | null;
}) {
  const pick = () => {
    if (page) {
      const picked = page.current?.selected();
      return picked ? { ...placeAbove(picked.rect), quote: memoQuote(memoLocation(file, null), picked.text) } : undefined;
    }
    const handle = editor.current;
    const rect = handle?.selectionRect();
    const text = handle?.selectedText();
    if (!handle || !rect || !text?.trim()) return undefined;
    return { ...placeAbove(rect), quote: memoQuote(memoLocation(file, handle.selectedLines()), text) };
  };
  return <SelectionAttachBox pick={pick} onAdd={(text) => attachMemoToChat(chatId, path, text)} />;
}
