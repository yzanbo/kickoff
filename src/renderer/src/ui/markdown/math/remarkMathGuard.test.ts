import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { convertTexDelimiters } from "@shared/markdown/mathGuard";
import { remarkMathGuard } from "./remarkMathGuard";

/** Markdown の部品と同じ組み合わせで HTML にする */
function render(markdown: string): string {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkMathGuard],
        rehypePlugins: [[rehypeKatex, { throwOnError: false, errorColor: "inherit", strict: false }]],
      },
      convertTexDelimiters(markdown),
    ),
  );
}

/** 文の中の数式の数（段落の数式の中の katex は数えない） */
const inlineCount = (html: string) => (html.match(/class="katex"/g) ?? []).length - displayCount(html);
const displayCount = (html: string) => (html.match(/class="katex-display"/g) ?? []).length;

test("1 つの $: 数式らしいものだけ数式にする", () => {
  const html = render("面積は $\\pi r^2$ で、$x$ を求める");
  assert.equal(inlineCount(html), 2);
  assert.equal(displayCount(html), 0);
});

test("1 つの $: 値段・シェルの変数は元の文のまま（$ も残す）", () => {
  const price = render("月 $5 から $20 に上げる");
  assert.equal(inlineCount(price), 0);
  assert.match(price, /月 \$5 から \$20 に上げる/);
  const shell = render("echo $HOME と $PATH");
  assert.equal(inlineCount(shell), 0);
  assert.match(shell, /echo \$HOME と \$PATH/);
});

test("$$: 段落にそれだけなら段落の数式、文の中なら文の中の数式", () => {
  assert.equal(displayCount(render("$$E = mc^2$$")), 1);
  assert.equal(displayCount(render("$$\nE = mc^2\n$$")), 1);
  const inline = render("式は $$a+b$$ です");
  assert.equal(displayCount(inline), 0);
  assert.equal(inlineCount(inline), 1);
});

test("\\( \\) と \\[ \\] も数式にする。コードの中は数式にしない", () => {
  assert.equal(inlineCount(render("角度 \\(\\theta\\) を使う")), 1);
  assert.equal(displayCount(render("\\[\n\\sum_{i=1}^n i\n\\]")), 1);
  assert.equal(inlineCount(render("`$x^2$` を書く\n\n```\n$y$\n```")), 0);
});

test("書き方の誤りは例外にせず、元の式を出す", () => {
  const html = render("$$\\frac{a$$");
  assert.match(html, /\\frac\{a/);
});
