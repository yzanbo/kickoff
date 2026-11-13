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

/** 返答の中で、文でなくても中身として右クリックを受けるもの（コード・表・画像・図・リンク・ボタン・組み立てた文のまとまり） */
const REPLY_CONTENT_SELECTOR = "pre, code, table, img, svg, video, a, button, .mermaid, [data-quote-text]";
/** 文の行の箱からこれだけ外れていても、文の上とみなす（px） */
const TEXT_HIT_SLACK = 2;

/**
 * 右クリックが AI の返答の行の空いた所（文の行の右・段落の間・行の上下の余白）か。返答の行は横幅いっぱいなので、
 * 会話の横幅を広げると、見た目は何もないところの大半が返答の行になり、チャットの画面の表示のメニューを開けなかった。
 * container の中で文を選んでいるときは選んだ文のメニューに任せる（false）
 */
export function onReplyBlank(e: MouseEvent, container: Element): boolean {
  const target = elementOf(e.target as Node | null);
  const reply = target?.closest(".assistant");
  if (!target || !reply || !container.contains(reply) || selectionWithin(container, { quotable: true })) return false;
  if (target.closest(REPLY_CONTENT_SELECTOR)) return false;
  // 押した要素の中の文字の行の箱のどれかに入っていれば文の上（段落の右の空きは段落の要素が受けるので、要素では決めない）
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects())
      if (e.clientX >= r.left - TEXT_HIT_SLACK && e.clientX <= r.right + TEXT_HIT_SLACK && e.clientY >= r.top - TEXT_HIT_SLACK && e.clientY <= r.bottom + TEXT_HIT_SLACK) return false;
  }
  return true;
}
