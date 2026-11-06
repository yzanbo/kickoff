import type { MouseEvent, ReactNode } from "react";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { copyRich } from "@/lib/richCopy";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { MemoMenuItems } from "@/features/memo/MemoMenuItems";
import { MessagesSquare } from "lucide-react";
import { openAskChild } from "@/features/chat/children/childChats";
import { selectionToMarkdown } from "@/ui/markdown/selectionMarkdown";

/** 子チャットに引用として渡す文の上限（文字。発言の全体を渡すときに長すぎないように） */
const MAX_QUOTE_CHARS = 4000;

/** 開いたときに選んでいた部分（text = 選んだ文のまま、markdown = 返答なら Markdown に戻したもの。自分の発言は文のまま） */
interface Selected {
  text: string;
  markdown: string;
}

/**
 * 発言の右クリックのメニュー。文を選んでいれば「選んだ部分をコピー」、いつも「メッセージ全体をコピー」。
 * rich（AI の返答）ならコピーは書式付き（ほかのアプリに貼っても見出し・表が崩れない。書式を受け取れない所には Markdown の文）で、
 * 選んだ部分は描いた表示を Markdown に戻してから（`selectionToMarkdown`）。
 * チャットの画面の中なら「子チャットで聞く」「メモ」の項目（どちらも選んでいる部分、なければ発言の全体を使う）も並べる。
 * リンク・入力欄・コードブロックの上などでは、Electron の既定のメニューに任せず、この 1 つにそろえる
 */
export function useMessageMenu(
  text: string,
  extra?: ReactNode,
  { rich = false, eventId }: { rich?: boolean; /** この発言の記録（子チャットで聞いた位置） */ eventId?: number } = {},
): { open: (e: MouseEvent) => void; element: ReactNode } {
  // 開いたときに選んでいた文（その発言の中で選んでいれば）
  const menu = useContextMenu<Selected | null>();
  const at = menu.menu;
  const selected = at?.value ?? null;
  const pane = useOptionalChatPane();
  const copy = (value: string) => void navigator.clipboard.writeText(value).catch(reportFailure("コピーできませんでした"));
  const copyFormatted = (value: string) => void copyRich(value).catch(reportFailure("コピーできませんでした"));
  return {
    open: (e) => {
      if (!text) return;
      // 発言の中で選んでいる文（ほかの発言にまたがる選択は、この発言の分だけでなく全体をそのまま使う）
      const selection = window.getSelection();
      const inside = selection && !selection.isCollapsed && selection.rangeCount > 0 && e.currentTarget.contains(selection.anchorNode);
      if (!inside || !selection.toString().trim()) return menu.open(e, null);
      const range = selection.getRangeAt(0);
      // 返答は Markdown の表示の要素から Markdown に戻す（メニューを開いている間に選択が変わっても、開いたときの部分を使う）
      const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
      const root = rich ? anchor?.closest(".markdown") : null;
      const plain = selection.toString();
      menu.open(e, { text: plain, markdown: root && root.contains(range.commonAncestorContainer) ? selectionToMarkdown(range, root) : plain.trim() });
    },
    element: at && (
      <PopupMenu at={at.at} label="発言の操作" onClose={menu.close}>
        {/* 返答は書式付き（貼る先が書式を受け取れれば見出し・表・コードのまま。受け取れなければ Markdown の文） */}
        {selected && <MenuItem onSelect={() => (rich ? copyFormatted(selected.markdown) : copy(selected.text))}>選んだ部分をコピー</MenuItem>}
        <MenuItem onSelect={() => (rich ? copyFormatted(text) : copy(text))}>メッセージ全体をコピー</MenuItem>
        {extra}
        {pane && (
          <>
            <div className="menu-separator" role="separator" />
            {/* 選んだ文（なければ発言の全体）を引用して、このチャットの作業を止めずに横で聞く */}
            <MenuItem onSelect={() => openAskChild({ parentId: pane.chatId, eventId: eventId ?? null, quote: (selected?.markdown || text).slice(0, MAX_QUOTE_CHARS) })}>
              <MessagesSquare size={14} /> 子チャットで聞く
            </MenuItem>
          </>
        )}
        {pane && <MemoMenuItems projectId={pane.projectId()} chatId={pane.chatId} text={selected?.markdown || text} />}
      </PopupMenu>
    ),
  };
}
