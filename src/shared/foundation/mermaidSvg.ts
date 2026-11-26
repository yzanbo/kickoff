// Mermaid が描いた SVG を、差し込む前に整える決まり（パソコンの画面とスマホの WebView で同じ）。
// Mermaid は securityLevel: "strict" でも、図に書いた click A "https://…" から SVG のリンク（<a xlink:href>）を作り、
// 画像の形（@{ img: … }）は <image href> で外を読みに行く（strict が止めるのは関数の呼び出しだけ）。
// - リンク（a）は外し、中身は位置などを写した g に入れ直す（押すと確認なしで窓が移る・外が開くため。Mermaid は押せる箱の位置を a の transform に付けるので、そのまま外すと箱が左上へずれる）
// - href・xlink:href・src は、同じ図の中を指す # のほかは消す（image・use・feImage などが外を読みに行かないように）
// - 中に HTML を入れる foreignObject・スクリプト・埋め込みは消す。on… の属性も消す
// - CSS の url(…) は # のほかを none にし、@import・image-set・@font-face も消す（style の属性と <style> の中。外を読みに行かないように）
// - href を書き換えるアニメーション（set・animate）は消す

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
  append(...nodes: never[]): void;
}

/** リンク（a）の代わりの g に写す属性（見た目と位置だけ。行き先・開き方は写さない） */
const GROUP_ATTRIBUTES = ["transform", "class", "style", "id"];
/** 中身ごと消すもの（小文字） */
const DROP = ["foreignobject", "script", "iframe", "object", "embed", "audio", "video", "canvas", "noscript"];
/** 属性を書き換えるアニメーション（attributeName が href のものだけ消す） */
const ANIMATIONS = ["set", "animate"];

/** CSS のコメントとエスケープ（\75 rl( = url( など） */
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const CSS_ESCAPE = /\\([0-9a-fA-F]{1,6})[ \t\n\f]?|\\([^\n0-9a-fA-F])/g;
/** 戻してから見る要るもの（エスケープかコメントを含む） */
const CSS_HIDDEN = /[\\]|\/\*/;
/** CSS の url(…) のうち、# で始まらないもの */
const EXTERNAL_CSS_URL = /url\(\s*(?!['"]?#)[^)]*\)/gi;
/** CSS で外を読む書き方のうち、url(…) を通らないもの（@import "…"・image-set("…")・@font-face） */
const CSS_IMPORT = /@import[^;]*;?/gi;
const CSS_IMAGE_SET = /(?:-webkit-)?image-set\([^)]*\)/gi;
const CSS_FONT_FACE = /@font-face\s*\{[^}]*\}?/gi;

/** CSS のエスケープを戻し、コメントを消した形（書き換えて隠した書き方も、戻してから判定・除去する） */
export function decodeCss(css: string): string {
  return css.replace(CSS_COMMENT, "").replace(CSS_ESCAPE, (_m, hex: string | undefined, ch: string | undefined) => {
    if (ch !== undefined) return ch;
    const code = Number.parseInt(hex ?? "", 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "�" : String.fromCodePoint(code);
  });
}

/**
 * CSS で外を読む書き方（# でない url(…)・@import・image-set・@font-face）を消す（style・classDef などから、書いた人の CSS も入る）。
 * エスケープ・コメントを含むものは、戻してから消す（隠した書き方を見逃さないように）
 */
export const stripCssUrls = (css: string): string => {
  const plain = CSS_HIDDEN.test(css) ? decodeCss(css) : css;
  return plain.replace(CSS_FONT_FACE, "").replace(CSS_IMPORT, "").replace(CSS_IMAGE_SET, "none").replace(EXTERNAL_CSS_URL, "none");
};

/** 外を指しうる属性 */
const isUrlAttribute = (name: string) => name === "href" || name === "src" || name.endsWith(":href");

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

/** 要素とその中を整える（root そのものは消さない・外さない）。makeGroup: リンクの代わりに置く、空の SVG の g を作る */
export function sanitizeSvgTree(root: SvgElementLike, makeGroup: () => SvgElementLike): void {
  cleanAttributes(root);
  for (const child of Array.from(root.children)) {
    const tag = child.localName.toLowerCase();
    if (DROP.includes(tag) || (ANIMATIONS.includes(tag) && isUrlAttribute((child.getAttribute("attributeName") ?? "").toLowerCase()))) {
      child.remove();
      continue;
    }
    sanitizeSvgTree(child, makeGroup);
    if (tag === "style") child.textContent = stripCssUrls(child.textContent ?? "");
    // リンクは外し、中身（整えたあとのもの）を、位置と見た目の属性だけを写した g に入れ直す
    if (tag === "a") {
      const group = makeGroup();
      for (const { name, value } of Array.from(child.attributes)) if (GROUP_ATTRIBUTES.includes(name.toLowerCase())) group.setAttribute(name, value);
      group.append(...(Array.from(child.childNodes) as never[]));
      child.replaceWith(group as never);
    }
  }
}

const re = (r: RegExp) => `new RegExp(${JSON.stringify(r.source)}, ${JSON.stringify(r.flags)})`;

/**
 * WebView のページの中で同じ整えをするスクリプト（スマホ。React Native の関数はページへ渡せないので、上の関数と同じ手順を文字で書く。
 * 一覧と正規表現は上と同じ値を埋め込む）。ページに mermaidSanitizeSvgTree(root, makeGroup) を置く。
 * 上の sanitizeSvgTree と同じ結果になることを mermaidSvg.test.ts が同じ例で確かめる
 */
export const SANITIZE_SVG_SCRIPT = `const mermaidSanitizeSvgTree = (() => {
  const GROUP_ATTRIBUTES = ${JSON.stringify(GROUP_ATTRIBUTES)};
  const DROP = ${JSON.stringify(DROP)};
  const ANIMATIONS = ${JSON.stringify(ANIMATIONS)};
  const CSS_COMMENT = ${re(CSS_COMMENT)};
  const CSS_ESCAPE = ${re(CSS_ESCAPE)};
  const CSS_HIDDEN = ${re(CSS_HIDDEN)};
  const EXTERNAL_CSS_URL = ${re(EXTERNAL_CSS_URL)};
  const CSS_IMPORT = ${re(CSS_IMPORT)};
  const CSS_IMAGE_SET = ${re(CSS_IMAGE_SET)};
  const CSS_FONT_FACE = ${re(CSS_FONT_FACE)};
  const decodeCss = (css) => css.replace(CSS_COMMENT, "").replace(CSS_ESCAPE, (_m, hex, ch) => {
    if (ch !== undefined) return ch;
    const code = Number.parseInt(hex ?? "", 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? String.fromCharCode(0xfffd) : String.fromCodePoint(code);
  });
  const stripCssUrls = (css) => {
    const plain = CSS_HIDDEN.test(css) ? decodeCss(css) : css;
    return plain.replace(CSS_FONT_FACE, "").replace(CSS_IMPORT, "").replace(CSS_IMAGE_SET, "none").replace(EXTERNAL_CSS_URL, "none");
  };
  const isUrlAttribute = (name) => name === "href" || name === "src" || name.endsWith(":href");
  const cleanAttributes = (el) => {
    for (const { name, value } of Array.from(el.attributes)) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on")) el.removeAttribute(name);
      else if (isUrlAttribute(lower) && !value.trim().startsWith("#")) el.removeAttribute(name);
      else if (lower === "style") {
        const css = stripCssUrls(value);
        if (css !== value) el.setAttribute(name, css);
      }
    }
  };
  const sanitize = (root, makeGroup) => {
    cleanAttributes(root);
    for (const child of Array.from(root.children)) {
      const tag = child.localName.toLowerCase();
      if (DROP.includes(tag) || (ANIMATIONS.includes(tag) && isUrlAttribute((child.getAttribute("attributeName") ?? "").toLowerCase()))) {
        child.remove();
        continue;
      }
      sanitize(child, makeGroup);
      if (tag === "style") child.textContent = stripCssUrls(child.textContent ?? "");
      if (tag === "a") {
        const group = makeGroup();
        for (const { name, value } of Array.from(child.attributes)) if (GROUP_ATTRIBUTES.includes(name.toLowerCase())) group.setAttribute(name, value);
        group.append(...Array.from(child.childNodes));
        child.replaceWith(group);
      }
    }
  };
  return sanitize;
})();`;
