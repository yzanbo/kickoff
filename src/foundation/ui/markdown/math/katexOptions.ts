// KaTeX の設定と、描いた式の整え（返答の Markdown の rehype-katex と、ノートのライブプレビューの renderToString で同じものを使う）
import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

/**
 * KaTeX に渡す設定。書き方の誤りは赤くせず、文字の色のまま元の式を出す。\href・\includegraphics など外へ出るものは trust: false で止める。
 * maxSize: \rule・\raisebox・\kern などに書いた大きさの上限（em）。KaTeX は正の大きさだけを丸める（\rule{500em}{500em} は 10em の箱、
 * \raisebox{30em} は 10em ほど上がる）。負の大きさ（\kern-50em・\raisebox{-30em}）は丸めないので、式の外へ出た分は CSS で描かない（Markdown.css）。
 * maxExpand: マクロを展開する回数の上限（KaTeX の既定と同じ 1000）。\neq・\dfrac・\cdots なども 1 回と数えるので、
 * 行列・和・極限を並べた式は 40 個並べると 1000 を超える（500 では 20 個で超える）。1000 回でも、長い \def を展開し続ける式は 219ms で止まる（M2 Pro で測った）
 */
export const KATEX_OPTIONS = { throwOnError: false, errorColor: "inherit", strict: false, trust: false, maxSize: 10, maxExpand: 1000 } as const;

/** 透明・透明度のある色（KaTeX が色に通すのは色の名前と #rgb・#rgba・#rrggbb・#rrggbbaa だけ） */
const SEE_THROUGH = /^\s*(?:transparent|#[0-9a-f]{4}|#[0-9a-f]{8})\s*$/i;
/** 色の項目（color・background-color・border-color など） */
const COLOR_PROPERTY = /(?:^|-)color$/i;

/**
 * 式の要素の style から、透明・透明度のある色を外す（\color{transparent}・\textcolor{#0000} で見えない文字を書かせない。
 * \phantom も同じ透明の色で描かれるので、中の文字が見えるようになる）
 */
export function safeMathStyle(style: string): string {
  const kept = style.split(";").filter((decl) => {
    const colon = decl.indexOf(":");
    return colon < 0 || !(COLOR_PROPERTY.test(decl.slice(0, colon).trim()) && SEE_THROUGH.test(decl.slice(colon + 1)));
  });
  return kept.join(";");
}

/** KaTeX が書いた HTML の文字列の style を整える（ノートのライブプレビュー。KaTeX は属性の値を書き換えの形にするので、" は中に出ない） */
export const safeMathHtml = (html: string): string => html.replace(/ style="([^"]*)"/g, (_m, style: string) => ` style="${safeMathStyle(style)}"`);

/** rehype-katex のあとに、描いた式の style を整える rehype のプラグイン */
export function rehypeSafeMath() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      const style = node.properties.style;
      if (typeof style === "string") node.properties.style = safeMathStyle(style);
    });
  };
}
