// KaTeX の設定と、描いた式の整え（返答の Markdown の rehype-katex と、ノートのライブプレビューの renderToString で同じものを使う）
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import { lengthMacros } from "@shared/foundation/math/katexLengths";
import {
  INLINE_MATH_MAX_EM,
  isHiddenMathml,
  isSeeThroughStyle,
  KATEX_SETTINGS,
  KATEX_TEXT_MACROS,
  katexBoxEm,
  SEE_THROUGH_CLASS,
  TALL_MATH_CLASS,
} from "@shared/foundation/math/katexSettings";

/**
 * KaTeX に渡す設定（@shared/foundation/math/katexSettings.ts の値と、文字・長さのマクロ）。KaTeX は描くたびに設定の macros を読むので、
 * そのたびに getter が新しい写しを作る（\gdef の書き換え・長さのマクロの数が式どうしで残らないように。返答の rehype-katex もノートも広げて渡す）
 */
export const KATEX_OPTIONS = {
  ...KATEX_SETTINGS,
  get macros(): Record<string, string | ((context: object) => object)> {
    return { ...KATEX_TEXT_MACROS, ...lengthMacros() };
  },
};

/** 要素のクラスの一覧（hast） */
const classesOf = (node: Element): string[] => (Array.isArray(node.properties.className) ? node.properties.className.map(String) : []);

/** hast の要素の中の支柱（katex-strut）の style */
function strutStyles(node: Element, out: string[] = []): string[] {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (classesOf(child).includes("katex-strut") && typeof child.properties.style === "string") out.push(child.properties.style);
    strutStyles(child, out);
  }
  return out;
}

/**
 * rehype-katex のあとに、描いた式を整える rehype のプラグイン（スマホのページの TIDY_KATEX_SCRIPT と同じ手順）。
 * - 見えない文字（透明な色の文字）は、見えないまま場所だけ取る形で残しつつ、選べないクラスと aria-hidden を付け、
 *   画面に出ない読み上げ用の MathML は中身を空にする（選んでコピーすると MathML の文字も入るため）
 * - 行の中の式の箱が INLINE_MATH_MAX_EM より高ければ TALL_MATH_CLASS を付ける（Markdown.css がその高さで切る。段落の式は CSS だけでスクロール）
 */
export function rehypeSafeMath() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, _index, parent) => {
      const style = node.properties.style;
      if (typeof style === "string" && isSeeThroughStyle(style)) {
        node.properties.className = [...classesOf(node), SEE_THROUGH_CLASS];
        node.properties.ariaHidden = "true";
      }
      if (isHiddenMathml(node.tagName, node.properties.mathcolor)) node.children = [];
      const inDisplay = parent?.type === "element" && classesOf(parent).includes("katex-display");
      if (classesOf(node).includes("katex") && !inDisplay && katexBoxEm(strutStyles(node)) > INLINE_MATH_MAX_EM) {
        node.properties.className = [...classesOf(node), TALL_MATH_CLASS];
      }
    });
  };
}

/** KaTeX が描いた DOM に、rehypeSafeMath と同じ整えをする（ノートのライブプレビュー。renderToString の HTML を入れたあと） */
export function tidyRenderedMath(root: ParentNode): void {
  for (const el of root.querySelectorAll("[style]")) {
    if (!isSeeThroughStyle(el.getAttribute("style") ?? "")) continue;
    el.classList.add(SEE_THROUGH_CLASS);
    el.setAttribute("aria-hidden", "true");
  }
  for (const el of root.querySelectorAll("mphantom, [mathcolor]")) if (isHiddenMathml(el.localName, el.getAttribute("mathcolor"))) el.replaceChildren();
  for (const el of root.querySelectorAll(".katex")) {
    if (el.closest(".katex-display")) continue;
    const styles = Array.from(el.querySelectorAll(".katex-strut"), (s) => s.getAttribute("style") ?? "");
    if (katexBoxEm(styles) > INLINE_MATH_MAX_EM) el.classList.add(TALL_MATH_CLASS);
  }
}
