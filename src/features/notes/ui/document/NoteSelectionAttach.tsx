import { SquarePen } from "lucide-react";
import type { MutableRefObject } from "react";
import { SelectionAttachBox } from "@/features/conversation/ui";
import { lineLocation } from "@/foundation/ui/lib/pathCopy";
import type { HtmlNotePageHandle } from "./HtmlNotePage";
import { noteQuote } from "./noteAttachment";
import type { NoteEditorHandle } from "./NoteEditor";
import type { NoteChatTargets } from "./useNoteEditMenu";

/**
 * ノートの本文で文を選ぶと、その上に足す先のボタンを出し、押すとすぐその入力欄に選択部分の引用（ファイルのフルパスと行番号付き。
 * HTML のページは行が分からないのでパスだけ）を足す（AI の返答で選んだときと同じ）。足す先は本文の右クリックと同じ（noteChatTargets）:
 * 右の欄・別ウィンドウのノートでは「「機能開発」に追加」（開いたチャット）と「ノートのチャットに追加」の 2 つ（子チャットの中で選んだときと同じ形）、
 * ノートのタブでは「ノートのチャットに追加」だけ。ノートのチャットに足すときは、閉じていればその欄を開く。
 * どこでも最後に「新しいチャットで始める」（引用を入力欄に入れた新しいチャットを、ノートのプロジェクトのチャットのパネルに開く。送るのは自分で）
 */
export function NoteSelectionAttach({
  targets,
  file,
  editor,
  page,
}: {
  targets: NoteChatTargets;
  /** ノートのファイルのフルパス */
  file: string;
  editor: MutableRefObject<NoteEditorHandle | null>;
  /** HTML のノートをページで見ているときの、ページを読む口（ソース・Markdown のときは null） */
  page: MutableRefObject<HtmlNotePageHandle | null> | null;
}) {
  const pick = () => {
    if (page) {
      const picked = page.current?.selected();
      return picked ? { rect: picked.rect, quote: noteQuote(lineLocation(file, null), picked.text) } : undefined;
    }
    const handle = editor.current;
    const rect = handle?.selectionRect();
    const text = handle?.selectedText();
    if (!handle || !rect || !text?.trim()) return undefined;
    return { rect, quote: noteQuote(lineLocation(file, handle.selectedLines()), text) };
  };
  return (
    <SelectionAttachBox
      pick={pick}
      targets={() => [
        ...targets.chats.map((target) => ({ label: `${target.name}に追加`, title: `選択部分を引用して、${target.name}の入力欄に足します（送るのは自分で）`, onAdd: target.addQuote })),
        { label: "新しいチャットで始める", title: "選択部分の引用を入力欄に入れた新しいチャットを開きます（送るのは自分で）", icon: SquarePen, onAdd: targets.newChat.startQuote },
      ]}
    />
  );
}
