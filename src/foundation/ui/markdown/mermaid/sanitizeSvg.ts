// Mermaid が描いた SVG を、画面に差し込む前に整える（整える決まりはスマホと同じ @shared/foundation/mermaidSvg.ts）
import { sanitizeSvgTree, type SvgElementLike } from "@shared/foundation/mermaidSvg";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * SVG の文字列を整えて返す。template の中で読む（文書に入らないので、画像などを読みに行かない）。
 * 先頭が svg でなければ投げる（差し込まずに、描けなかった図として出す）
 */
export function sanitizeMermaidSvg(svg: string): string {
  const template = document.createElement("template");
  template.innerHTML = svg;
  const root = template.content.firstElementChild;
  if (!root || root.localName !== "svg") throw new Error("図の SVG を読めませんでした");
  for (const extra of Array.from(template.content.children)) if (extra !== root) extra.remove();
  sanitizeSvgTree(root, () => document.createElementNS(SVG_NS, "g") as unknown as SvgElementLike);
  return template.innerHTML;
}
