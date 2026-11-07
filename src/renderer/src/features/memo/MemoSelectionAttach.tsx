import type { MutableRefObject } from "react";
import { SelectionAttachBox } from "@/features/chat/messages/SelectionAttach";
import { lineLocation } from "@/lib/pathCopy";
import type { HtmlMemoPageHandle } from "./HtmlMemoPage";
import { memoQuote } from "./memoAttachment";
import type { MemoEditorHandle } from "./MemoEditor";
import type { MemoChatTarget } from "./useMemoEditMenu";

/**
 * メモの本文で文を選ぶと、その上に足す先のボタンを出し、押すとすぐその入力欄に選択部分の引用（ファイルのフルパスと行番号付き。
 * HTML のページは行が分からないのでパスだけ）を足す（AI の返答で選んだときと同じ）。足す先は本文の右クリックと同じ（memoChatTargets）:
 * 右の欄・別ウィンドウのメモでは「「機能開発」に追加」（開いたチャット）と「メモのチャットに追加」の 2 つ（子チャットの中で選んだときと同じ形）、
 * メモのタブでは「メモのチャットに追加」だけ。メモのチャットに足すときは、閉じていればその欄を開く
 */
export function MemoSelectionAttach({
  targets,
  file,
  editor,
  page,
}: {
  targets: { main?: MemoChatTarget; memo: MemoChatTarget };
  /** メモのファイルのフルパス */
  file: string;
  editor: MutableRefObject<MemoEditorHandle | null>;
  /** HTML のメモをページで見ているときの、ページを読む口（ソース・Markdown のときは null） */
  page: MutableRefObject<HtmlMemoPageHandle | null> | null;
}) {
  const pick = () => {
    if (page) {
      const picked = page.current?.selected();
      return picked ? { rect: picked.rect, quote: memoQuote(lineLocation(file, null), picked.text) } : undefined;
    }
    const handle = editor.current;
    const rect = handle?.selectionRect();
    const text = handle?.selectedText();
    if (!handle || !rect || !text?.trim()) return undefined;
    return { rect, quote: memoQuote(lineLocation(file, handle.selectedLines()), text) };
  };
  return (
    <SelectionAttachBox
      pick={pick}
      targets={() =>
        [targets.main, targets.memo].flatMap((target) =>
          target ? [{ label: `${target.name}に追加`, title: `選択部分を引用して、${target.name}の入力欄に足します（送るのは自分で）`, onAdd: target.addQuote }] : [],
        )
      }
    />
  );
}
