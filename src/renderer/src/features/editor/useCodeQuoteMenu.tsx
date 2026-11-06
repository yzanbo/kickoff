import type { MouseEvent, ReactNode } from "react";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { AddToChatItems } from "@/features/chat/messages/AddToChatItems";
import { pickedInCode } from "@/features/chat/messages/SelectionAttach";
import { useMainChat } from "@/features/chat/pane/mainChatContext";

/** 開いたときの様子: 選んだ行の引用（なければ null）・ファイルのフルパス・コピーする文 */
interface CodeMenuSource {
  quote: string | null;
  path: string;
  copy: string;
}

/**
 * 右の欄・別ウィンドウの「変更」の差分・「ファイル」の中身の行（`[data-quote-path]` の中）の右クリックのメニュー: 「メインのチャット」の組
 * （選んでいれば「選んだ部分を追加」= パスと行番号付きのコードの引用、いつも「パスを追加」= dir からのフルパス）とコピー。
 * 右の欄・別ウィンドウの外（ファイルタブなど）では何もしない（ブラウザの既定のまま）
 */
export function useCodeQuoteMenu(dir: string | undefined): { onContextMenu?: (e: MouseEvent<HTMLElement>) => void; element: ReactNode } {
  const inSide = useMainChat() !== null;
  const menu = useContextMenu<CodeMenuSource>();
  const shown = menu.menu;
  return {
    onContextMenu: inSide
      ? (e) => {
          // 見出しなど、自分のメニューを出す所は任せる
          if (e.defaultPrevented) return;
          const section = (e.target as Element).closest<HTMLElement>("[data-quote-path]");
          const rel = section?.dataset.quotePath;
          if (!section || !rel || !e.currentTarget.contains(section)) return;
          menu.open(e, { quote: pickedInCode(section)?.quote ?? null, path: dir ? `${dir}/${rel}` : rel, copy: window.getSelection()?.toString() ?? "" });
        }
      : undefined,
    element: shown && (
      <PopupMenu at={shown.at} label="コードの操作" onClose={menu.close}>
        <AddToChatItems quote={shown.value.quote} quoteLabel="選んだ部分を追加" path={shown.value.path} />
        <MenuItem disabled={!shown.value.copy} onSelect={() => void navigator.clipboard.writeText(shown.value.copy).catch(reportFailure("コピーできませんでした"))}>
          コピー
        </MenuItem>
      </PopupMenu>
    ),
  };
}
