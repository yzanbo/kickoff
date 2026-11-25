/**
 * Mermaid が描いた SVG を、画面に差し込む前に整える。Mermaid は securityLevel: "strict" でも、図に書いた click A "https://…" から
 * SVG のリンク（<a xlink:href>）を作り、画像の形（@{ img: … }）は <image href> で外を読みに行く（strict が止めるのは関数の呼び出しだけ）。
 * - リンク（a）は中身を残して外す（押すと確認なしで窓が移る・外が開くため）
 * - href・xlink:href・src は、同じ図の中を指す # のほかは消す（image・use・feImage などが外を読みに行かないように）
 * - 中に HTML を入れる foreignObject・スクリプト・埋め込みは消す。on… の属性も消す
 * - CSS の url(…) は # のほかを none にし、@import・image-set も消す（style の属性と <style> の中。外を読みに行かないように）
 * - href を書き換えるアニメーション（set・animate）は消す
 */
import { decodeCss } from "./mermaidResources";

/** 整えに使う DOM の口（Element の一部。テストでは偽の木を渡す） */
export interface SvgElementLike {
  readonly localName: string;
  readonly attributes: ArrayLike<{ readonly name: string; readonly value: string }>;
  readonly children: ArrayLike<SvgElementLike>;
  readonly childNodes: ArrayLike<unknown>;
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  remove(): void;
  replaceWith(...nodes: never[]): void;
}

/** 中身ごと消すもの（小文字） */
const DROP = new Set(["foreignobject", "script", "iframe", "object", "embed", "audio", "video", "canvas", "noscript"]);
/** 属性を書き換えるアニメーション（attributeName が href のものだけ消す） */
const ANIMATIONS = new Set(["set", "animate"]);
/** 外を指しうる属性 */
const isUrlAttribute = (name: string) => name === "href" || name === "src" || name.endsWith(":href");
/** CSS の url(…) のうち、# で始まらないもの */
const EXTERNAL_CSS_URL = /url\(\s*(?!['"]?#)[^)]*\)/gi;

/** CSS で外を読む書き方のうち、url(…) を通らないもの（@import "…"・image-set("…")） */
const CSS_IMPORT = /@import[^;]*;?/gi;
const CSS_IMAGE_SET = /(?:-webkit-)?image-set\([^)]*\)/gi;
const CSS_FONT_FACE = /@font-face\s*\{[^}]*\}?/gi;

/**
 * CSS で外を読む書き方（# でない url(…)・@import・image-set・@font-face）を消す（style・classDef などから、書いた人の CSS も入る）。
 * エスケープ（\75 rl( = url(）・コメントを含むものは、戻してから消す（隠した書き方を見逃さないように）
 */
export const stripCssUrls = (css: string): string => {
  const plain = /[\\]|\/\*/.test(css) ? decodeCss(css) : css;
  return plain.replace(CSS_FONT_FACE, "").replace(CSS_IMPORT, "").replace(CSS_IMAGE_SET, "none").replace(EXTERNAL_CSS_URL, "none");
};

/** 1 つの要素の属性を整える */
function cleanAttributes(el: SvgElementLike) {
  for (const { name, value } of Array.from(el.attributes)) {
    const lower = name.toLowerCase();
    if (lower.startsWith("on")) el.removeAttribute(name);
    else if (isUrlAttribute(lower) && !value.trim().startsWith("#")) el.removeAttribute(name);
    else if (lower === "style") {
      const css = stripCssUrls(value);
      if (css !== value) el.setAttribute(name, css);
    }
  }
}

/** 要素とその中を整える（root そのものは消さない・外さない） */
export function sanitizeSvgTree(root: SvgElementLike): void {
  cleanAttributes(root);
  for (const child of Array.from(root.children)) {
    const tag = child.localName.toLowerCase();
    if (DROP.has(tag) || (ANIMATIONS.has(tag) && isUrlAttribute((child.getAttribute("attributeName") ?? "").toLowerCase()))) {
      child.remove();
      continue;
    }
    sanitizeSvgTree(child);
    if (tag === "style") child.textContent = stripCssUrls(child.textContent ?? "");
    // リンクは中身（整えたあとのもの）を残して外す
    if (tag === "a") child.replaceWith(...(Array.from(child.childNodes) as never[]));
  }
}

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
  sanitizeSvgTree(root);
  return template.innerHTML;
}
