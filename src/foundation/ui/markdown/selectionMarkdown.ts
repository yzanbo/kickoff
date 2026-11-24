// 返答（Markdown の表示）の中で選んだ範囲を、Markdown の文に戻す（選択部分のコピー・引用で、見出し・表・コードを崩さないため）。
// 描いた DOM を構文木（hast）にして、Markdown の木（mdast）を経て文にする。チャットの表示と同じ GitHub の書き方（表・取り消し線など）で書く
import type { Element as HastElement, Nodes as HastNodes, Root as HastRoot } from "hast";
import { fromDom } from "hast-util-from-dom";
import { toMdast } from "hast-util-to-mdast";
import { gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";

/** Markdown に入れない飾り（コードブロックの上の帯の言語名とコピーのボタン） */
const DECORATION_CLASSES = ["code-block-head"];

/** 範囲がこの中で始まって終わるとき、書式を失わないよう包み直す要素（コード・強調・リンク） */
const INLINE_WRAPPERS = new Set(["pre", "code", "strong", "b", "em", "i", "del", "s", "a"]);
/** 範囲の共通の親がこれなら、項目・行だけにならないよう入れ物ごと包み直す（表は table まで） */
const LIST_CONTAINERS = new Set(["ul", "ol"]);
const TABLE_PARTS = new Set(["table", "thead", "tbody", "tr"]);

const isDecoration = (node: HastNodes): boolean => {
  if (node.type !== "element") return false;
  const classes = node.properties.className;
  return Array.isArray(classes) && classes.some((c) => DECORATION_CLASSES.includes(String(c)));
};

/** 飾りを除いた木（元の木は変えない） */
function withoutDecorations<T extends HastRoot | HastElement>(node: T): T {
  return { ...node, children: node.children.filter((c) => !isDecoration(c)).map((c) => (c.type === "element" ? withoutDecorations(c) : c)) };
}

/** 描いた Markdown の木（hast）を Markdown の文にする（前後の空白は削る） */
export function hastToMarkdown(tree: HastRoot): string {
  const mdast = toMdast(withoutDecorations(tree));
  return toMarkdown(mdast, { extensions: [gfmToMarkdown()], bullet: "-", emphasis: "*", strong: "*", rule: "-", fences: true }).trim();
}

/** 選んだ範囲の中身を、書式が分かるよう外側の要素で包み直した断片にする（root より外はたどらない） */
function wrappedFragment(range: Range, root: Element): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let wrapped: Node = range.cloneContents();
  const common = range.commonAncestorContainer;
  const start = common instanceof Element ? common : common.parentElement;
  for (let el = start; el && el !== root && root.contains(el); el = el.parentElement) {
    const name = el.localName;
    const wraps =
      INLINE_WRAPPERS.has(name) ||
      (el === start && LIST_CONTAINERS.has(name)) ||
      // 表の中で始まったら、行・本体から table までを包む
      (TABLE_PARTS.has(name) && start !== null && TABLE_PARTS.has(start.localName));
    if (!wraps) continue;
    const clone = el.cloneNode(false);
    clone.appendChild(wrapped);
    wrapped = clone;
  }
  fragment.appendChild(wrapped);
  return fragment;
}

/** 選んだ範囲を Markdown の文にする（root は Markdown の表示の要素。文にならなければ選んだ文のまま） */
export function selectionToMarkdown(range: Range, root: Element): string {
  const tree = fromDom(wrappedFragment(range, root));
  const markdown = tree.type === "root" ? hastToMarkdown(tree) : "";
  return markdown || range.toString().trim();
}
