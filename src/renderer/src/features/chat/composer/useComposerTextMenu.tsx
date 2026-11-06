import type { MouseEvent, ReactNode, RefObject } from "react";
import { ClipboardItems } from "@/ui/ClipboardItems";
import { PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";

/** 右クリックしたときの選択範囲と、その文 */
interface Picked {
  start: number;
  end: number;
  text: string;
}

/**
 * チャット欄の文を書く欄の右クリックのメニュー: 「クリップボード」の組（切り取り・コピー・貼り付け。右クリックしたときの選択範囲に効く）と、
 * その下に呼ぶ側の項目（items。定型文の帯の表示の切り替えなど）。
 * 書き換えは入力と同じ扱いの execCommand で入れ、⌘Z で戻せるようにする（React の onChange にも届く）。使えなければ setText で入れる
 */
export function useComposerTextMenu({
  textareaRef,
  setText,
  items,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  setText: (text: string) => void;
  items?: ReactNode;
}): { onContextMenu: (e: MouseEvent<HTMLTextAreaElement>) => void; element: ReactNode } {
  const menu = useContextMenu<Picked>();
  const replace = ({ start, end }: Picked, value: string) => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
    if (!document.execCommand(value ? "insertText" : "delete", false, value)) setText(el.value.slice(0, start) + value + el.value.slice(end));
  };
  const picked = menu.menu?.value;
  return {
    onContextMenu: (e) => {
      const el = e.currentTarget;
      menu.open(e, { start: el.selectionStart, end: el.selectionEnd, text: el.value.slice(el.selectionStart, el.selectionEnd) });
    },
    element: menu.menu && picked && (
      <PopupMenu at={menu.menu.at} label="入力欄" onClose={menu.close}>
        <ClipboardItems text={picked.text} path={null} onCut={() => replace(picked, "")} onPaste={(text) => replace(picked, text)} />
        {items && (
          <>
            <div className="menu-separator" role="separator" />
            {items}
          </>
        )}
      </PopupMenu>
    ),
  };
}
