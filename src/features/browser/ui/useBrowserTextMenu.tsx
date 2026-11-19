import { useEffect, useEffectEvent, type MouseEvent } from "react";
import { ClipboardItems } from "@/foundation/ui/kit/ClipboardItems";
import { MenuItem, PopupMenu } from "@/foundation/ui/kit/PopupMenu";
import { useContextMenu } from "@/foundation/ui/kit/useContextMenu";

/** webview の外にある URL 欄・ページ内検索欄の右クリック。ほかの部品の右クリックには触らない */
export function useBrowserTextMenu(visible: boolean) {
  const menu = useContextMenu<{ input: HTMLInputElement; text: string; start: number; end: number }>();
  const shown = menu.menu;
  const close = useEffectEvent(() => menu.close());
  useEffect(() => {
    if (!visible) close();
  }, [visible]);
  const replace = (insert: string) => {
    if (!shown) return;
    const { input, start, end } = shown.value;
    if (!input.isConnected) return;
    input.focus();
    input.setSelectionRange(start, end);
    const text = insert.replace(/[\r\n]+/g, " ");
    // キーでの入力と同じく React の onChange に届き、⌘Z も使える
    document.execCommand(text ? "insertText" : "delete", false, text);
  };
  return {
    onContextMenu: (e: MouseEvent) => {
      const input = e.target;
      if (e.defaultPrevented || !(input instanceof HTMLInputElement) || input.type !== "text") return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      menu.open(e, { input, text: input.value.slice(start, end), start, end });
    },
    element: visible && shown && (
      <PopupMenu at={shown.at} label="ブラウザの入力欄の操作" onClose={menu.close}>
        <ClipboardItems path={null} text={shown.value.text} onCut={() => replace("")} onPaste={replace} />
        <MenuItem onSelect={() => {
          shown.value.input.focus();
          shown.value.input.select();
        }}>すべて選択</MenuItem>
      </PopupMenu>
    ),
  };
}
