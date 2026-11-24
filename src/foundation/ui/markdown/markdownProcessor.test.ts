import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement, Fragment, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { convertTexDelimiters } from "@shared/foundation/markdown/mathGuard";
import { createBlockSplitter, splitBlocks } from "@/foundation/ui/markdown/streaming/markdownBlocks";
import { remarkMathGuard } from "@/foundation/ui/markdown/math/remarkMathGuard";
import { createBlockCache, createPipeline, isHtmlComment, pipelineOf, renderMarkdown } from "./markdownProcessor";

/*
 * 等しいことのテスト: react-markdown そのもので全文を描いた結果と、
 * ブロックに分けて作り置きの処理で描いた結果（ブロックの間に改行の文字を置く。Markdown の部品と同じ）が同じであること。
 * react-markdown と写した道具（markdownProcessor.ts の先頭）を上げるときは、このテストで写しのずれを見る
 */

type PluggableList = NonNullable<Options["remarkPlugins"]>;

/** 部品（Markdown の部品と同じく a・pre・table を差し替える。context を読まない形） */
const components: Components = {
  a: ({ node, href, children }) => createElement("a", { href, "data-file": String(node?.properties.dataFilePath ?? "") }, children),
  pre: ({ node: _node, ...props }) => createElement("div", { className: "code-block" }, createElement("pre", props)),
  table: ({ node: _node, ...props }) => createElement("div", { className: "markdown-table" }, createElement("table", props)),
};

/** ファイルのチップの差し込みの代わり（インラインコードに印を付ける。ブロックをまたがない） */
const fakeFileLinks = () => (tree: { children?: unknown[] }) => {
  const walk = (node: { type?: string; data?: Record<string, unknown>; children?: unknown[] }) => {
    if (node.type === "inlineCode") node.data = { hName: "a", hProperties: { href: "#", dataFilePath: "x" } };
    node.children?.forEach((c) => walk(c as typeof node));
  };
  walk(tree);
};

const math = {
  remark: [[remarkMath, { singleDollarTextMath: true }], remarkMathGuard] as PluggableList,
  rehype: [[rehypeKatex, { throwOnError: false, errorColor: "inherit", strict: false }]] as PluggableList,
};

/** HTML のコメントだけの raw を消す（作り置きの処理がわざと react-markdown と変えた所。比べる前に同じにそろえる） */
const dropHtmlComments = () => (tree: { children?: unknown[] }) => {
  const walk = (node: { type?: string; value?: string; children?: unknown[] }) => {
    if (!node.children) return;
    node.children = node.children.filter((c) => {
      const child = c as typeof node;
      return !(child.type === "raw" && isHtmlComment(child.value ?? ""));
    });
    node.children.forEach((c) => walk(c as typeof node));
  };
  walk(tree);
};

/** react-markdown で全文を描く（HTML のコメントは、作り置きの処理と同じく消す） */
function whole(text: string, remarkPlugins: PluggableList, rehypePlugins: PluggableList): string {
  return renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins, rehypePlugins: [...rehypePlugins, dropHtmlComments], components }, text));
}

/** ブロックに分けて描く（ブロックの間には、全文で描いたときと同じく改行の文字を置く） */
function blocks(text: string, render: (block: string) => ReactElement): string {
  return renderToStaticMarkup(createElement(Fragment, null, ...splitBlocks(text).map((b, i) => createElement(Fragment, { key: i }, i > 0 && "\n", render(b)))));
}

const SAMPLES = [
  "# 見出し\n\n段落 **太字** と *斜体* と ~~取り消し~~ と `code`。\n続きの行。\n\n## 小見出し\n\n> 引用\n> 続き\n\n---\n\n終わり",
  "| ファイル | 行 | 内容 |\n|---|---:|:---:|\n| `src/a.ts` | 0 | 直した |\n| `src/b.ts` | 10 | **直した** |\n\n後ろの段落",
  "```ts\nfunction a() {\n\n  return 1;\n}\n```\n\n- 箇条書き 1\n- 箇条書き 2\n\n1. 番号\n\n2. 番号 2\n\n   続きの段落\n\n3. 番号 3",
  "- [ ] まだ\n- [x] 済み\n\n- a\n  - 入れ子\n\n    字下げの段落\n\n段落\n\n    字下げのコード\n\n    続き",
  "https://example.com と <https://example.org> と www.example.net\n\n[リンク](https://example.com \"題\") と [危ない](javascript:alert(1)) と ![画像](x.png)",
  "<div>HTML の\n\nブロック</div>\n\n<!--\nコメント\n\n続き\n-->\n\n<pre>\na\n\nb</pre>\n\n後ろ",
  "図の前\n\n<!-- visual: v-s1xidvm4 -->\n\n文の中 <!-- 目印 --> の続き\n\n<!-- a --> 同じ行の文\n\n<!-- 閉じていない",
  "参照のリンク [これ][r] と脚注[^1]。\n\n別の段落\n\n[r]: https://example.com\n[^1]: 脚注の本文",
  "````md\n```\n中\n\n```\n````\n\n~~~\nチルダ\n\n~~~\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n閉じていない\n\n```py\nprint(1)\n\n",
  "見出し\n===\n\n下線の見出し\n---\n\n* 星\n\n+ 足す\n\n1) かっこ\n2) かっこ",
  "&amp; &copy; \\* エスケープ \\`\n\n行末の空白で改行  \n次の行\n\n<br>\n\n最後",
];

const MATH_SAMPLES = [
  "式 $x^2$ と $$y$$ と \\(a+b\\)。値段は $5 です。\n\n$$\n\\int_0^1 f(x)\\,dx\n\n$$\n\n\\[\n\\sum_i i\n\\]\n\n後ろ",
  "段落 $a$\n\n$$\nE = mc^2\n$$\n\n- 箇条書きの $b$\n\n- 次\n\n`$HOME` は数式ではない",
];

test("ブロックに分けて作り置きの処理で描いた結果は、react-markdown で全文を描いた結果と同じ", () => {
  const plain = pipelineOf(undefined, null);
  for (const text of SAMPLES) {
    assert.equal(
      blocks(text, (b) => renderMarkdown(plain, b, components)),
      whole(text, [remarkGfm], []),
      JSON.stringify(text),
    );
  }
});

test("ファイルのチップの差し込み・数式（KaTeX）があっても同じ", () => {
  const withLinks = createPipeline([remarkGfm, fakeFileLinks], []);
  for (const text of SAMPLES) {
    assert.equal(
      blocks(text, (b) => renderMarkdown(withLinks, b, components)),
      whole(text, [remarkGfm, fakeFileLinks], []),
      JSON.stringify(text),
    );
  }
  const withMath = pipelineOf(undefined, math);
  for (const source of [...MATH_SAMPLES, ...SAMPLES]) {
    const text = convertTexDelimiters(source);
    assert.equal(
      blocks(text, (b) => renderMarkdown(withMath, b, components)),
      whole(text, [remarkGfm, ...math.remark], math.rehype),
      JSON.stringify(text),
    );
  }
});

test("生の HTML: コメントだけのものは出さず、ほかはこれまでどおり文字で出す（動かさない）", () => {
  const render = (text: string) => renderToStaticMarkup(renderMarkdown(pipelineOf(undefined, null), text, components));
  assert.equal(render("前\n\n<!-- visual: v-s1xidvm4 -->\n\n後ろ"), "<p>前</p>\n\n<p>後ろ</p>");
  assert.equal(render("文の中 <!-- 目印 --> の続き"), "<p>文の中  の続き</p>");
  assert.equal(render("<!--\n複数行の\n\nコメント\n--> <!-- 続けて -->"), "");
  // コメント以外の生の HTML・コメントと文が混ざったもの・閉じていないコメントは文字のまま
  assert.match(render("<div onclick=\"x()\">中</div>"), /&lt;div onclick=&quot;x\(\)&quot;&gt;中&lt;\/div&gt;/);
  assert.match(render("文 <b>太</b>"), /<p>文 &lt;b&gt;太&lt;\/b&gt;<\/p>/);
  assert.match(render("<!-- a --> 同じ行の文"), /&lt;!-- a --&gt; 同じ行の文/);
  assert.match(render("<!-- 閉じていない"), /&lt;!-- 閉じていない/);
  assert.ok(isHtmlComment("  <!-- a -->\n<!-- b -->  "));
  assert.ok(!isHtmlComment("<!-- a --> b <!-- c -->"));
});

test("pipelineOf: 差し込み・数式の組ごとに 1 つだけ作る", () => {
  const links: PluggableList[number] = [fakeFileLinks, "root"];
  assert.equal(pipelineOf(links, null), pipelineOf(links, null));
  assert.notEqual(pipelineOf(links, null), pipelineOf(links, math));
  assert.notEqual(pipelineOf(links, null), pipelineOf(undefined, null));
  assert.equal(pipelineOf(undefined, math), pipelineOf(undefined, math));
});

test("renderMarkdown: tail があれば終わりの文字を薄く包む（コードブロックの中は包まない）", () => {
  const html = renderToStaticMarkup(renderMarkdown(pipelineOf(undefined, null), "前の文字\n\n```\ncode\n```\n\n後ろ", components, [2, 0, 0]));
  assert.match(html, /<p><span class="stream-fade-1">後ろ<\/span><\/p>/);
  assert.match(html, /<code>code\n<\/code>/);
});

test("createBlockCache: 同じ処理の組と文なら同じ要素を返し、数と字数の上限で古いものから捨てる", () => {
  const pipeline = pipelineOf(undefined, null);
  const cache = createBlockCache({ count: 2, chars: 1000 });
  const a = cache.render(pipeline, "a", components);
  assert.equal(cache.render(pipeline, "a", components), a);
  cache.render(pipeline, "b", components);
  cache.render(pipeline, "c", components);
  assert.notEqual(cache.render(pipeline, "a", components), a);
  // 字数の上限を超える 1 つは覚えない
  const small = createBlockCache({ count: 10, chars: 5 });
  const long = small.render(pipeline, "長い文字列です", components);
  assert.notEqual(small.render(pipeline, "長い文字列です", components), long);
});

test("書いている途中の閉じていないコードブロックは、その開きより後ろから始まる pre だけ（閉じた図は返答の途中でも描く U4 の見分け）", () => {
  const text = "前\n\n```mermaid\nA-->B\n```\n後ろの文\n```mermaid\ngraph TD\n  C-->";
  const { blocks, openFence } = createBlockSplitter().split(text);
  assert.equal(blocks.length, 2);
  assert.ok(openFence !== null);
  const starts: number[] = [];
  const probe: Components = {
    pre: ({ node }) => {
      starts.push(node?.position?.start.offset ?? -1);
      return null;
    },
  };
  renderToStaticMarkup(renderMarkdown(pipelineOf(undefined, null), blocks[1], probe));
  assert.deepEqual(
    starts.map((s) => s >= openFence),
    [false, true],
  );
});
