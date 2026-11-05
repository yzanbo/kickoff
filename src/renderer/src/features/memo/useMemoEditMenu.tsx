import type { MutableRefObject, ReactNode } from "react";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { quoteComment } from "@/features/chat/messages/quoteComment";
import type { MemoEditorHandle } from "./MarkdownEditor";

/**
 * メモの本文の右クリックのメニュー: チャットに追加（選んだ文を引用にして、メモのチャットの入力欄の後ろに足す。送るのは自分で）・
 * 切り取り・コピー・貼り付け。文を選んだだけではチャットに足さない（右クリックで選んだときだけ）
 */
export function useMemoEditMenu(editor: MutableRefObject<MemoEditorHandle | null>, addToChat: (quote: string) => void): {
  open: (at: { x: number; y: number }) => void;
  element: ReactNode;
} {
  const menu = useContextMenu<string>();
  const shown = menu.menu;
  const selected = shown?.value ?? "";
  const copy = () => navigator.clipboard.writeText(selected);
  return {
    // 開いたときに選んでいた文を覚える（メニューを押すまでに選択が変わっても、開いたときの文を使う）
    open: (at) => menu.openAt(at, editor.current?.selectedText() ?? ""),
    element: shown && (
      <PopupMenu at={shown.at} label="メモの本文の操作" onClose={menu.close}>
        <MenuItem disabled={!selected.trim()} title={selected.trim() ? "選んだ文を引用にして、メモのチャットの入力欄に足します" : "本文で文を選んでから使えます"} onSelect={() => addToChat(quoteComment(selected, ""))}>
          チャットに追加
        </MenuItem>
        <div className="menu-separator" role="separator" />
        <MenuItem
          disabled={!selected}
          onSelect={() =>
            void copy().then(
              () => editor.current?.insert(""),
              reportFailure("切り取れませんでした"),
            )
          }
        >
          切り取り
        </MenuItem>
        <MenuItem disabled={!selected} onSelect={() => void copy().catch(reportFailure("コピーできませんでした"))}>
          コピー
        </MenuItem>
        <MenuItem
          onSelect={() =>
            void navigator.clipboard.readText().then(
              (text) => editor.current?.insert(text),
              reportFailure("貼り付けられませんでした"),
            )
          }
        >
          貼り付け
        </MenuItem>
      </PopupMenu>
    ),
  };
}
