import type { MouseEvent, ReactNode } from "react";
import { ClipboardItems } from "@/ui/ClipboardItems";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { AddToChatItems } from "@/features/chat/messages/AddToChatItems";
import { pickedInCode, type Picked } from "@/features/chat/messages/SelectionAttach";
import { useMainChat } from "@/features/chat/pane/mainChatContext";

/** 開いたときの様子: 選んだ行の引用（なければ null）・ファイルのフルパス・コピーする文・選んだ行のコードと行（パスを含めてコピー。行を選んでいなければ null） */
interface CodeMenuSource {
  quote: string | null;
  path: string;
  copy: string;
  code: Picked["code"] | null;
}

/**
 * 右の欄・別ウィンドウの「変更」の差分・「ファイル」の中身の行（`[data-quote-path]` の中）の右クリックのメニュー: 「メインのチャット」の組
 * （選んでいれば「選択部分を追加」= パスと行番号付きのコードの引用、いつも「パスを追加」= dir からのフルパス）と「クリップボード」の組
 * （ClipboardItems: コピー・パスを含めてコピー（行を選んでいれば `パス:12-14` と行のコード）・パスをコピー）。
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
          const picked = pickedInCode(section);
          menu.open(e, { quote: picked?.quote ?? null, path: dir ? `${dir}/${rel}` : rel, copy: window.getSelection()?.toString() ?? "", code: picked?.code ?? null });
        }
      : undefined,
    element: shown && (
      <PopupMenu at={shown.at} label="コードの操作" onClose={menu.close}>
        <AddToChatItems quote={shown.value.quote} what="選択部分" path={shown.value.path} />
        <ClipboardItems text={shown.value.copy} selection={shown.value.code?.text ?? shown.value.copy} path={shown.value.path} lines={shown.value.code?.lines ?? null} />
      </PopupMenu>
    ),
  };
}
