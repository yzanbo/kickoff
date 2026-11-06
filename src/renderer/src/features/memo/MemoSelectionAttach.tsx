import type { MutableRefObject } from "react";
import { SelectionAttachBox } from "@/features/chat/messages/SelectionAttach";
import { attachMemoToChat } from "./attachMemo";
import type { HtmlMemoPageHandle } from "./HtmlMemoPage";
import { memoLocation, memoQuote } from "./memoAttachment";
import type { MemoEditorHandle } from "./MemoEditor";

/**
 * 右の欄・別ウィンドウのメモで文を選ぶと、その上に「チャットに追加」を出し、押すとすぐ開いたチャット（chatId）の入力欄に
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
      return picked ? { rect: picked.rect, quote: memoQuote(memoLocation(file, null), picked.text) } : undefined;
    }
    const handle = editor.current;
    const rect = handle?.selectionRect();
    const text = handle?.selectedText();
    if (!handle || !rect || !text?.trim()) return undefined;
    return { rect, quote: memoQuote(memoLocation(file, handle.selectedLines()), text) };
  };
  return (
    <SelectionAttachBox
      pick={pick}
      targets={() => [{ label: "チャットに追加", title: "選んだ部分を引用して、チャットの入力欄に足します（送るのは自分で）", onAdd: (text) => attachMemoToChat(chatId, path, text) }]}
    />
  );
}
