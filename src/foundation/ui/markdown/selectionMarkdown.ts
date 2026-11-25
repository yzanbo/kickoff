// 返答（Markdown の表示）の中で選んだ範囲を、Markdown の文に戻す（選択部分のコピー・引用で、見出し・表・コードを崩さないため）。
// 描いた DOM を構文木（hast）にして、Markdown の木（mdast）を経て文にする。チャットの表示と同じ GitHub の書き方（表・取り消し線など）で書く
import type { Element as HastElement, Nodes as HastNodes, Root as HastRoot } from "hast";
import { fromDom } from "hast-util-from-dom";
import { toMdast } from "hast-util-to-mdast";
import { gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { cjkFriendlyToMarkdown } from "mdast-util-to-markdown-cjk-friendly";
import { cjkFriendlyGfmStrikethroughToMarkdown } from "mdast-util-to-markdown-cjk-friendly-gfm-strikethrough";

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

/**
 * 数式（KaTeX が描いたもの）を置き換える印の要素（data-tex を持つ span。Markdown の木で inlineMath・math にする）。
 * span にするのは、知らない名前の要素だとブロックとみなされ、前後の空白が消えるため
 */
const MATH_TAG = "span";

const classesOf = (node: HastElement): string[] => (Array.isArray(node.properties.className) ? node.properties.className.map(String) : []);

/** KaTeX の要素の中の、書いた式（MathML の annotation の TeX）。なければ null */
function texOf(node: HastElement): string | null {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "annotation") return child.children.map((c) => (c.type === "text" ? c.value : "")).join("");
    const found = texOf(child);
    if (found !== null) return found;
  }
  return null;
}

/**
 * 数式を、書いた式（TeX）の印に置き換えた木（元の木は変えない）。KaTeX の要素は、読み上げ用の MathML と見た目の HTML の両方の文字を持つので、
 * そのまま文にすると「x2」のように崩れる（分数は分母が先に出る）。式が分からない（途中だけ選んだ）ものは、そのまま
 */
function withMathAsTex<T extends HastRoot | HastElement>(node: T): T {
  const children = node.children.map((child) => {
    if (child.type !== "element") return child;
    const classes = classesOf(child);
    const display = classes.includes("katex-display");
    const tex = display || classes.includes("katex") ? texOf(child) : null;
    // 中に式の文字を置く（空の要素だと、前後の空白がつながったものとして 1 つに縮められる）
    if (tex !== null) return { type: "element" as const, tagName: MATH_TAG, properties: { dataTex: tex.trim(), dataDisplay: display }, children: [{ type: "text" as const, value: tex.trim() }] };
    return withMathAsTex(child);
  });
  return { ...node, children };
}

/**
 * 印の要素を Markdown の木の数式にする（hast-util-to-mdast の handlers。inlineMath は文の中のもの・math はブロック）。
 * 印でない span は、hast-util-to-mdast の既定と同じく中身だけにする
 */
const mathHandlers = {
  [MATH_TAG]: (state: { all(node: HastElement): unknown }, node: HastElement) =>
    node.properties.dataTex === undefined ? state.all(node) : { type: node.properties.dataDisplay ? "math" : "inlineMath", value: String(node.properties.dataTex) },
} as unknown as NonNullable<Parameters<typeof toMdast>[1]>["handlers"];

/** 数式を書き出す（式の中の記号を書き換えの形にしない。表示と同じ $…$ と、$$ の行で挟んだブロック） */
const mathToMarkdown = {
  inlineMath: (node: { value: string }) => ["$", node.value, "$"].join(""),
  math: (node: { value: string }) => ["$$", node.value, "$$"].join("\n"),
} as unknown as NonNullable<Parameters<typeof toMarkdown>[1]>["handlers"];

/**
 * 描いた Markdown の木（hast）を Markdown の文にする（前後の空白は削る。数式は書いた式に戻す）。
 * 強調・取り消し線は表示と同じ日本語向けの決まりで書く（ないと **…**は の「は」を、CommonMark で読み直せるよう &#x306F; にする）
 */
export function hastToMarkdown(tree: HastRoot): string {
  const mdast = toMdast(withMathAsTex(withoutDecorations(tree)), { handlers: mathHandlers });
  return toMarkdown(mdast, { extensions: [gfmToMarkdown(), cjkFriendlyToMarkdown(), cjkFriendlyGfmStrikethroughToMarkdown()], handlers: mathToMarkdown, bullet: "-", emphasis: "*", strong: "*", rule: "-", fences: true }).trim();
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

/** 範囲の端が数式の途中なら、その式の全体まで広げる（書いた式に戻せるように） */
function withWholeMath(range: Range): Range {
  const mathOf = (node: Node) => {
    const el = node instanceof Element ? node : node.parentElement;
    return el?.closest(".katex-display") ?? el?.closest(".katex") ?? null;
  };
  const whole = range.cloneRange();
  const start = mathOf(range.startContainer);
  const end = mathOf(range.endContainer);
  if (start) whole.setStartBefore(start);
  if (end) whole.setEndAfter(end);
  return whole;
}

/** 選んだ範囲を Markdown の文にする（root は Markdown の表示の要素。文にならなければ選んだ文のまま） */
export function selectionToMarkdown(range: Range, root: Element): string {
  const tree = fromDom(wrappedFragment(withWholeMath(range), root));
  const markdown = tree.type === "root" ? hastToMarkdown(tree) : "";
  return markdown || range.toString().trim();
}
