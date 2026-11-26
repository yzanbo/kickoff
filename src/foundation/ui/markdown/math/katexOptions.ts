// KaTeX の設定と、描いた式の整え（返答の Markdown の rehype-katex と、ノートのライブプレビューの renderToString で同じものを使う）
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";
import { lengthMacros } from "@shared/foundation/math/katexLengths";
import { isHiddenMathml, isSeeThroughStyle, KATEX_SETTINGS, KATEX_TEXT_MACROS, SEE_THROUGH_CLASS } from "@shared/foundation/math/katexSettings";

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

/**
 * rehype-katex のあとに、見えない文字（透明な色の文字）を、見えないまま場所だけ取る形で残しつつ、選べない・コピーに入らない形にする
 * rehype のプラグイン（式の見た目は変えない）。見た目の HTML は選べないクラスと aria-hidden を付け、
 * 画面に出ない読み上げ用の MathML は中身を空にする（選んでコピーすると MathML の文字も入るため）
 */
export function rehypeSafeMath() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const style = node.properties.style;
      if (typeof style === "string" && isSeeThroughStyle(style)) {
        const classes = Array.isArray(node.properties.className) ? node.properties.className : [];
        node.properties.className = [...classes, SEE_THROUGH_CLASS];
        node.properties.ariaHidden = "true";
      }
      if (isHiddenMathml(node.tagName, node.properties.mathcolor)) node.children = [];
    });
  };
}

/** KaTeX が描いた DOM に、rehypeSafeMath と同じ整えをする（ノートのライブプレビュー。renderToString の HTML を入れたあと） */
export function hideSeeThroughMath(root: ParentNode): void {
  for (const el of root.querySelectorAll("[style]")) {
    if (!isSeeThroughStyle(el.getAttribute("style") ?? "")) continue;
    el.classList.add(SEE_THROUGH_CLASS);
    el.setAttribute("aria-hidden", "true");
  }
  for (const el of root.querySelectorAll("mphantom, [mathcolor]")) if (isHiddenMathml(el.localName, el.getAttribute("mathcolor"))) el.replaceChildren();
}
