import type { MouseEvent, ReactNode } from "react";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { copyRich } from "@/lib/richCopy";

/**
 * 発言の右クリックのメニュー（メッセージをコピー。文を選んでいれば、選んだ文のコピーも）。
 * rich（AI の返答）なら「メッセージをコピー」は書式付き（ほかのアプリに貼っても見出し・表が崩れない）で、Markdown のままのコピーも並べる。
 * リンク・入力欄・コードブロックの上などでは、Electron の既定のメニューに任せず、この 1 つにそろえる
 */
export function useMessageMenu(text: string, extra?: ReactNode, { rich = false }: { rich?: boolean } = {}): { open: (e: MouseEvent) => void; element: ReactNode } {
  // 開いたときに選んでいた文（その発言の中で選んでいれば）
  const menu = useContextMenu<string>();
  const at = menu.menu;
  const copy = (value: string) => void navigator.clipboard.writeText(value).catch(reportFailure("コピーできませんでした"));
  const copyFormatted = (value: string) => void copyRich(value).catch(reportFailure("コピーできませんでした"));
  return {
    open: (e) => {
      if (!text) return;
      // 発言の中で選んでいる文（ほかの発言にまたがる選択は、この発言の分だけでなく全体をそのまま使う）
      const selection = window.getSelection();
      const selected = selection && !selection.isCollapsed && e.currentTarget.contains(selection.anchorNode) ? selection.toString() : "";
      menu.open(e, selected);
    },
    element: at && (
      <PopupMenu at={at.at} label="発言の操作" onClose={menu.close}>
        {at.value && <MenuItem onSelect={() => copy(at.value)}>選んだ文をコピー</MenuItem>}
        <MenuItem onSelect={() => (rich ? copyFormatted(text) : copy(text))}>メッセージをコピー</MenuItem>
        {rich && <MenuItem onSelect={() => copy(text)}>Markdown のままコピー</MenuItem>}
        {extra}
      </PopupMenu>
    ),
  };
}
