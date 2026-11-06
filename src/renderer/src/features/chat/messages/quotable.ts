import type { MouseEvent } from "react";
import { selectionToMarkdown } from "@/ui/markdown/selectionMarkdown";

/**
 * 中の文を選んで「チャットに追加」・右クリックできる所（会話の流れ・サブエージェントの画面の手順）の印。
 * 発言だけでなく、質問のカード・ツールの行・サブエージェントのカードなど、中の文ならどれでも選んで足せる
 */
export const QUOTABLE_ATTR = "data-quotable";
const QUOTABLE_SELECTOR = `[${QUOTABLE_ATTR}]`;

/** 書く欄（その他の回答など）の中の選択は、ふつうの編集に任せる */
const EDITABLE_SELECTOR = "input, textarea, [contenteditable='true'], [contenteditable='']";

/** 開閉する行（ツールの行の summary・サブエージェントのカードの見出し）。右クリックで丸ごと足せ、文を選んで離したときは開閉しない */
const TOGGLE_ROW_SELECTOR = "summary, [role='button'][aria-expanded]";

/** 選んでいる文（text = 選んだ文のまま、markdown = 返答の Markdown の表示の中なら Markdown に戻したもの。ほかは文のまま）と範囲 */
export interface QuotedSelection {
  text: string;
  markdown: string;
  range: Range;
  /** Markdown の表示の中から選んだか（コピーを書式付きにする） */
  rich: boolean;
}

function elementOf(node: Node | null): Element | null {
  return node instanceof Element ? node : (node?.parentElement ?? null);
}

/**
 * container の中から選び始めた文（なければ null。ほかの発言にまたがる選択は、選んだ分をそのまま使う）。
 * quotable なら、選択が「チャットに追加できる所」の中にあるときだけ。書く欄の中の選択・空白だけの選択は数えない
 */
export function selectionWithin(container: Element | null, { quotable = false }: { quotable?: boolean } = {}): QuotedSelection | null {
  const selection = window.getSelection();
  if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const anchor = elementOf(selection.anchorNode);
  const common = elementOf(range.commonAncestorContainer);
  if (!anchor || !common || !container.contains(anchor) || anchor.closest(EDITABLE_SELECTOR)) return null;
  if (quotable && !common.closest(QUOTABLE_SELECTOR)) return null;
  const text = selection.toString();
  if (!text.trim()) return null;
  // 返答の Markdown の表示の中だけを選んでいれば Markdown に戻す（メモ・子チャットには書式のまま渡す）
  const markdownRoot = common.closest(".markdown");
  if (markdownRoot) return { text, markdown: selectionToMarkdown(range, markdownRoot), range, rich: true };
  return { text, markdown: text.trim(), range, rich: false };
}

/**
 * 右クリックした所の、選んでいなくても丸ごと足せるまとまり（なければ null）。
 * 質問・質問への回答など、文を組み立てて持つもの（`data-quote-text` と `data-quote-noun`）を先に、なければ開閉する行（ツールの行・サブエージェントのカードの見出し）の文
 */
export function quoteBlockAt(target: EventTarget | null, container: Element): { text: string; noun: string } | null {
  const at = elementOf(target as Node | null);
  const block = at?.closest<HTMLElement>("[data-quote-text]");
  if (block && container.contains(block) && block.dataset.quoteText) return { text: block.dataset.quoteText, noun: block.dataset.quoteNoun ?? "項目" };
  const row = at?.closest<HTMLElement>(TOGGLE_ROW_SELECTOR);
  const text = row && container.contains(row) ? row.innerText.replace(/\s*\n\s*/g, " ").trim() : "";
  return text ? { text, noun: "行" } : null;
}

/** 右クリックが書く欄の上か（そのときは、この右クリックのメニューを出さない） */
export function onEditable(target: EventTarget | null): boolean {
  return Boolean(elementOf(target as Node | null)?.closest(EDITABLE_SELECTOR));
}

/**
 * 「チャットに追加できる所」の押したとき（onClickCapture）。開閉する行（ツールの行・サブエージェントのカードの見出し）・選択肢（質問の label）の文をドラッグで選んだときは、
 * 開閉・選んだことにしない（選び終えたマウスのボタンを離すと、その行を押したことになるため）
 */
export function keepSelectionOnClick(e: MouseEvent) {
  const toggle = elementOf(e.target as Node | null)?.closest(`${TOGGLE_ROW_SELECTOR}, label`);
  const selection = window.getSelection();
  if (toggle && selection && !selection.isCollapsed && selection.anchorNode && toggle.contains(selection.anchorNode)) {
    // 既定の動き（summary の開閉・label の選択）も、部品の onClick（カードの見出しの開閉）も止める
    e.preventDefault();
    e.stopPropagation();
  }
}
