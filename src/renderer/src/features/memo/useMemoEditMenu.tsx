import type { MutableRefObject, ReactNode } from "react";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { quoteComment } from "@/features/chat/messages/quoteComment";
import type { MemoEditorHandle } from "./MemoEditor";

/**
 * 開いたときの様子: text = 選んでいた文、insert = 書ける所なら選んでいた範囲を置き換える関数（null なら書けない。
 * HTML のメモのページの表示は書けないので、切り取り・貼り付けを出さない）、copyAll = 何も選んでいないときにコピーする文（題名の欄は題名の全体）
 */
interface MemoMenuSource {
  text: string;
  insert: ((text: string) => void) | null;
  copyAll?: string;
}

/**
 * メモの本文の右クリックのメニュー: メモのチャットに追加（選んだ文を引用にして、メモのチャットの入力欄の後ろに足す。送るのは自分で）・
 * メインのチャットに追加・添付（attachToMain を渡したとき。チャットの右の欄・別ウィンドウのメモ。選んでいればその部分の引用を足し、なければメモ全体を添付）・
 * 切り取り・コピー・貼り付け。文を選んだだけではチャットに足さない（右クリックで選んだときだけ）。
 * HTML のメモのページの表示からは、選んだ文を渡して開く（チャットに追加・添付・コピーだけ）。
 * 見出しの題名の欄からも同じメニューを開く（openFor。切り取り・貼り付けは題名の欄に効き、何も選んでいなければコピーは題名の全体）
 */
export function useMemoEditMenu(
  editor: MutableRefObject<MemoEditorHandle | null>,
  addToChat: (quote: string) => void,
  attachToMain?: (selection: string) => void,
): {
  open: (at: { x: number; y: number }, pageSelection?: string) => void;
  openFor: (at: { x: number; y: number }, source: MemoMenuSource) => void;
  element: ReactNode;
} {
  const menu = useContextMenu<MemoMenuSource>();
  const shown = menu.menu;
  const selected = shown?.value.text ?? "";
  const insert = shown?.value.insert ?? null;
  const copyText = selected || shown?.value.copyAll || "";
  const copy = (text: string) => navigator.clipboard.writeText(text);
  return {
    // 開いたときに選んでいた文を覚える（メニューを押すまでに選択が変わっても、開いたときの文を使う）
    open: (at, pageSelection) =>
      menu.openAt(
        at,
        pageSelection === undefined
          ? { text: editor.current?.selectedText() ?? "", insert: (text) => editor.current?.insert(text) }
          : { text: pageSelection, insert: null },
      ),
    openFor: (at, source) => menu.openAt(at, source),
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
        {insert && (
          <MenuItem
            disabled={!selected}
            onSelect={() =>
              void copy(selected).then(
                () => insert(""),
                reportFailure("切り取れませんでした"),
              )
            }
          >
            切り取り
          </MenuItem>
        )}
        <MenuItem disabled={!copyText} onSelect={() => void copy(copyText).catch(reportFailure("コピーできませんでした"))}>
          コピー
        </MenuItem>
        {insert && (
          <MenuItem
            onSelect={() =>
              void navigator.clipboard.readText().then(
                (text) => insert(text),
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
