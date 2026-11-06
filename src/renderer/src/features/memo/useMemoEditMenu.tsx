import type { MutableRefObject, ReactNode } from "react";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { quoteComment } from "@/features/chat/messages/quoteComment";
import type { MemoEditorHandle } from "./MemoEditor";

/** 開いたときの様子（選んでいた文と、書ける所か。HTML のメモのページの表示は書けないので、切り取り・貼り付けを出さない） */
interface MenuSource {
  text: string;
  editable: boolean;
}

/**
 * メモの本文の右クリックのメニュー: メモのチャットに追加（選んだ文を引用にして、メモのチャットの入力欄の後ろに足す。送るのは自分で）・
 * メインのチャットに追加・添付（attachToMain を渡したとき。チャットの右の欄・別ウィンドウのメモ。選んでいればその部分の引用を足し、なければメモ全体を添付）・
 * 切り取り・コピー・貼り付け。文を選んだだけではチャットに足さない（右クリックで選んだときだけ）。
 * HTML のメモのページの表示からは、選んだ文を渡して開く（チャットに追加・添付・コピーだけ）
 */
export function useMemoEditMenu(
  editor: MutableRefObject<MemoEditorHandle | null>,
  addToChat: (quote: string) => void,
  attachToMain?: (selection: string) => void,
): {
  open: (at: { x: number; y: number }, pageSelection?: string) => void;
  element: ReactNode;
} {
  const menu = useContextMenu<MenuSource>();
  const shown = menu.menu;
  const selected = shown?.value.text ?? "";
  const editable = shown?.value.editable ?? false;
  const copy = () => navigator.clipboard.writeText(selected);
  return {
    // 開いたときに選んでいた文を覚える（メニューを押すまでに選択が変わっても、開いたときの文を使う）
    open: (at, pageSelection) =>
      menu.openAt(at, pageSelection === undefined ? { text: editor.current?.selectedText() ?? "", editable: true } : { text: pageSelection, editable: false }),
    element: shown && (
      <PopupMenu at={shown.at} label="メモの本文の操作" onClose={menu.close}>
        <MenuItem disabled={!selected.trim()} title={selected.trim() ? "選んだ文を引用にして、メモのチャットの入力欄に足します" : "本文で文を選んでから使えます"} onSelect={() => addToChat(quoteComment(selected, ""))}>
          メモのチャットに追加
        </MenuItem>
        {attachToMain && (
          <MenuItem title={selected.trim() ? "選んだ文を引用にして、開いたチャットの入力欄に足します" : "このメモを、開いたチャットの入力欄に添付します"} onSelect={() => attachToMain(selected)}>
            {selected.trim() ? "選んだ部分をメインのチャットに追加" : "メモをメインのチャットに添付"}
          </MenuItem>
        )}
        <div className="menu-separator" role="separator" />
        {editable && (
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
        )}
        <MenuItem disabled={!selected} onSelect={() => void copy().catch(reportFailure("コピーできませんでした"))}>
          コピー
        </MenuItem>
        {editable && (
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
        )}
      </PopupMenu>
    ),
  };
}
