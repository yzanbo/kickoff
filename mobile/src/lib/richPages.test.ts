import assert from "node:assert/strict";
import { test } from "vitest";
import { DISPLAY_MATH_MAX_EM, INLINE_MATH_MAX_EM, KATEX_SETTINGS, KATEX_TEXT_MACROS, TALL_MATH_CLASS } from "@shared/foundation/math/katexSettings";
import { VISUAL_FRAME_CSP } from "@shared/visuals/visualDocument";
import { hasMath, mathPage, mermaidPage, visualPage } from "./richPages";

/** ページの CSP の meta を読み、決まりの名前 → 値の表にする */
function cspOf(page: string): Map<string, string> {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(page)?.[1] ?? "";
  return new Map(csp.split("; ").map((d) => [d.slice(0, d.indexOf(" ")), d.slice(d.indexOf(" ") + 1)]));
}

test("hasMath: パソコンと同じ決まりで、数式があるときだけ WebView にする", () => {
  assert.ok(hasMath("面積は $\\pi r^2$"));
  assert.ok(hasMath("$$E=mc^2$$"));
  assert.ok(!hasMath("月 $5 から $20 に上げる"));
  assert.ok(!hasMath("`$x$` はコード"));
});

test("mathPage: 文は逃がしてそのまま、数式の場所だけを KaTeX で描く印にする", () => {
  const page = mathPage("<b>注意</b> 面積は $\\pi r^2$\n$$\nE=mc^2\n$$");
  assert.ok(page.includes("&lt;b&gt;注意&lt;/b&gt;"));
  assert.match(page, /<span class="tex" data-display="" data-tex="\\pi r\^2">\$\\pi r\^2\$<\/span>/);
  assert.match(page, /data-display="1" data-tex="E=mc\^2"/);
  assert.match(page, /cdn\.jsdelivr\.net\/npm\/katex@0\.19\.1\/dist\/katex\.min\.(css|js)/);
});

test("mathPage: KaTeX の設定・文字のマクロ・長さのマクロ・描いたあとの整えはパソコンと同じものを入れる", () => {
  const page = mathPage("$x$");
  assert.ok(page.includes(`const KATEX_SETTINGS = ${JSON.stringify(KATEX_SETTINGS)};`));
  assert.ok(page.includes(`const KATEX_TEXT_MACROS = ${JSON.stringify(KATEX_TEXT_MACROS)};`));
  assert.match(page, /"trust":false/);
  assert.match(page, /macros: \{ \.\.\.KATEX_TEXT_MACROS, \.\.\.kickoffLengthMacros\(\) \}/);
  assert.match(page, /kickoffTidyKatex\(el\)/);
  assert.match(page, /\.katex-see-through \{ user-select: none;/);
  assert.match(page, /\.katex \.katex-base \{ clip-path: inset\(-0\.25em\); \}/);
  // 式の箱の縦の上限はパソコンと同じ（段落の式はスクロール・高すぎる行の中の式は切る）
  assert.ok(page.includes(`max-height: ${DISPLAY_MATH_MAX_EM}em;`));
  assert.ok(page.includes(`.katex.${TALL_MATH_CLASS} { display: inline-block; max-height: ${INLINE_MATH_MAX_EM}em; overflow: hidden;`));
});

test("mathPage・mermaidPage の CSP: スクリプトは CDN から読めるが、画像は data: と blob: だけ（CDN の画像も読めない）・通信はしない", () => {
  const math = cspOf(mathPage("$x$"));
  const mermaid = cspOf(mermaidPage("flowchart LR\nA-->B"));
  for (const csp of [math, mermaid]) {
    assert.equal(csp.get("default-src"), "'none'");
    assert.equal(csp.get("img-src"), "data: blob:");
    assert.equal(csp.get("connect-src"), "'none'");
    assert.match(csp.get("script-src") ?? "", /https:\/\/cdn\.jsdelivr\.net/);
  }
  // KaTeX の CSS とフォントは CDN から。Mermaid の図の CSS・フォントは外を読めない
  assert.equal(math.get("style-src"), "'unsafe-inline' https://cdn.jsdelivr.net");
  assert.equal(math.get("font-src"), "data: https://cdn.jsdelivr.net");
  assert.equal(mermaid.get("style-src"), "'unsafe-inline'");
  assert.equal(mermaid.get("font-src"), "data:");
});

test("mermaidPage: 書いた文を逃がして置き、描いた SVG を整えるスクリプトと、HTML のラベル・配色を変えさせない設定で描く", () => {
  const page = mermaidPage("flowchart LR\nA-->B<script>");
  assert.match(page, /<div id="src">flowchart LR\nA--&gt;B&lt;script&gt;<\/div>/);
  assert.match(page, /mermaidSanitizeSvgTree\(root,/);
  assert.match(page, /"htmlLabels":false/);
  assert.match(page, /"secure":\[[^\]]*"themeCSS"/);
});

test("mermaidPage: 描く途中で外を読む書き方の図は、Mermaid を読まずに断る（パソコンと同じ判定）", () => {
  for (const code of ['sequenceDiagram\n  participant A\n  properties A: {"icon": "https://cdn.jsdelivr.net/gh/x/y/a.png"}', 'flowchart TD\n  A@{ img: "https://cdn.jsdelivr.net/gh/x/y/a.png" }', "flowchart TD\n  A-->B\n  style A fill:url(https://cdn.jsdelivr.net/gh/x/y/a.png)"]) {
    const page = mermaidPage(code);
    assert.doesNotMatch(page, /mermaid\.min\.js/, code);
    assert.match(page, /外の画像・CSS を読む図は描きません/, code);
  }
});

test("visualPage: SVG・HTML はパソコンと同じページに CSP とスマホの配色", () => {
  const svg = visualPage("svg", "<svg/>");
  assert.ok(svg.includes(`content="${VISUAL_FRAME_CSP}"`));
  assert.match(svg, /--vis-bg: #1b1f20;/);
  assert.match(svg, /ReactNativeWebView/);
});

test("高さの知らせ: head の中の文なので、body の大きさは文書を読み終えてから見張る（読み込み中の body は null）", () => {
  for (const page of [mathPage("$x$"), mermaidPage("flowchart LR\nA-->B")]) {
    assert.match(page, /addEventListener\("DOMContentLoaded", \(\) => new ResizeObserver\(report\)\.observe\(document\.body\)\)/);
    assert.ok(page.indexOf("ResizeObserver") < page.indexOf("<body>"));
  }
});
