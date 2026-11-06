import type { MouseEvent, ReactNode } from "react";
import { reportFailure } from "@/ui/dialogs";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { copyRich } from "@/lib/richCopy";
import { useOptionalChatPane } from "@/features/chat/pane/chatPaneContext";
import { MemoMenuItems } from "@/features/memo/MemoMenuItems";
import { MessagesSquare } from "lucide-react";
import { openAskChild } from "@/features/chat/children/childChats";
import { AddToChatItems } from "./AddToChatItems";
import { onEditable, quoteBlockAt, selectionWithin } from "./quotable";
import { quoteComment } from "./quoteComment";

/** 子チャットに引用として渡す文の上限（文字。発言の全体を渡すときに長すぎないように） */
const MAX_QUOTE_CHARS = 4000;

/** 右クリックした項目の丸ごとの文（選んでいなければ、これを使う。text が空なら、選んだ部分だけを扱う） */
interface QuoteSource {
  text: string;
  /** 項目の呼び名（「メッセージ」「質問」など。「〜全体をコピー」「〜を追加」に使う） */
  noun: string;
  /** 書式付きでコピーするか（AI の返答） */
  rich: boolean;
  /** この発言の記録（子チャットで聞いた位置） */
  eventId: number | null;
}

/** 開いたときに選んでいた部分（text = 選んだ文のまま、markdown = 返答なら Markdown に戻したもの。rich = 書式付きでコピーする） */
interface Selected {
  text: string;
  markdown: string;
  rich: boolean;
}

/**
 * チャットの中の文の右クリックのメニュー（発言・質問のカード・ツールの行・サブエージェントの画面など、どこでも同じ形）。
 * 文を選んでいれば「選択部分をコピー」、項目の丸ごとの文があれば「〜全体をコピー」。書式付き（ほかのアプリに貼っても見出し・表が崩れない。
 * 書式を受け取れない所には Markdown の文）でコピーするのは、AI の返答とその選択部分（描いた表示を Markdown に戻してから `selectionToMarkdown`）。
 * いちばん上に「チャットに追加」（AddToChatItems。右の欄・別ウィンドウでは「メインのチャット」の組）、チャットの画面の中なら「子チャットで聞く」「メモ」も
 * 並べる（どれも選んでいる部分、なければ項目の全体を使う）。リンク・コードブロックの上などでも、Electron の既定のメニューに任せず、この 1 つにそろえる。
 * - openFor(e, source): 発言など、項目が自分で開く（その項目の中で選んでいれば選択部分、なければ項目の全体）
 * - openInRegion(e): 流れ全体（`data-quotable` の入れ物）で受ける。項目が自分のメニューを開いていなければ、選んでいる部分か、
 *   右クリックした所の丸ごと足せるまとまり（`data-quote-text`）で開く。どちらもなければ開かない
 */
export function useQuoteMenu(extra?: ReactNode) {
  const menu = useContextMenu<{ source: QuoteSource; selected: Selected | null }>();
  const at = menu.menu;
  const pane = useOptionalChatPane();
  const copy = (value: string) => void navigator.clipboard.writeText(value).catch(reportFailure("コピーできませんでした"));
  const copyFormatted = (value: string) => void copyRich(value).catch(reportFailure("コピーできませんでした"));
  const selectedIn = (container: Element, quotable: boolean): Selected | null => {
    // 開いたときの部分を覚える（メニューを開いている間に選択が変わっても、開いたときの部分を使う）
    const selection = selectionWithin(container, { quotable });
    return selection && { text: selection.text, markdown: selection.markdown, rich: selection.rich };
  };
  let element: ReactNode = null;
  if (at) {
    const { source, selected } = at.value;
    const quoted = selected?.markdown || source.text;
    element = (
      <PopupMenu at={at.at} label="文の操作" onClose={menu.close}>
        <AddToChatItems quote={quoteComment(quoted, "")} what={selected ? "選択部分" : source.noun} />
        {selected && <MenuItem onSelect={() => (selected.rich ? copyFormatted(selected.markdown) : copy(selected.text))}>選択部分をコピー</MenuItem>}
        {source.text && <MenuItem onSelect={() => (source.rich ? copyFormatted(source.text) : copy(source.text))}>{source.noun}全体をコピー</MenuItem>}
        {extra}
        {pane && (
          <>
            <div className="menu-separator" role="separator" />
            {/* 選んだ文（なければ項目の全体）を引用して、このチャットの作業を止めずに横で聞く */}
            <MenuItem onSelect={() => openAskChild({ parentId: pane.chatId, eventId: source.eventId, quote: quoted.slice(0, MAX_QUOTE_CHARS) })}>
              <MessagesSquare size={14} /> 子チャットで聞く
            </MenuItem>
          </>
        )}
        {pane && <MemoMenuItems projectId={pane.projectId()} chatId={pane.chatId} text={quoted} />}
      </PopupMenu>
    );
  }
  return {
    openFor: (e: MouseEvent, source: QuoteSource) => menu.open(e, { source, selected: selectedIn(e.currentTarget as Element, false) }),
    openInRegion: (e: MouseEvent) => {
      // 発言・ファイルのリンクなど、自分のメニューを開いた所と、書く欄の上は任せる
      if (e.defaultPrevented || onEditable(e.target)) return;
      const region = e.currentTarget as Element;
      const selected = selectedIn(region, true);
      const block = quoteBlockAt(e.target, region);
      if (!selected && !block) return;
      menu.open(e, { source: { text: block?.text ?? "", noun: block?.noun ?? "", rich: false, eventId: null }, selected });
    },
    element,
  };
}

/** 発言（自分の発言・AI の返答）の右クリックのメニュー。rich（AI の返答）ならコピーは書式付き。extra は発言だけの項目（もう一度送る・書き直しなど） */
export function useMessageMenu(
  text: string,
  extra?: ReactNode,
  { rich = false, eventId }: { rich?: boolean; /** この発言の記録（子チャットで聞いた位置） */ eventId?: number } = {},
): { open: (e: MouseEvent) => void; element: ReactNode } {
  const quote = useQuoteMenu(extra);
  return {
    open: (e) => {
      if (text) quote.openFor(e, { text, noun: "メッセージ", rich, eventId: eventId ?? null });
    },
    element: quote.element,
  };
}
