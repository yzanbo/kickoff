import { test } from "vitest";
import assert from "node:assert/strict";
import type { ElementContent, Properties, Root } from "hast";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { markdownToHast, pipelineOf } from "./markdownProcessor";
import { mathPluginsOf } from "./math/mathPlugins";
import { hastToMarkdown } from "./selectionMarkdown";

const h = (tagName: string, properties: Properties, ...children: (ElementContent | string)[]): ElementContent => ({
  type: "element",
  tagName,
  properties,
  children: children.map((c) => (typeof c === "string" ? { type: "text", value: c } : c)),
});
const root = (...children: ElementContent[]): Root => ({ type: "root", children });

test("hastToMarkdown: 見出し・強調・インラインコード・リスト・リンクを Markdown に戻す", () => {
  const tree = root(
    h("h2", {}, "設計"),
    h("p", {}, "認証は ", h("strong", {}, "Cookie"), " で持つ（", h("code", {}, "auth.ts"), "）"),
    h("ul", {}, h("li", {}, "一つ目"), h("li", {}, h("a", { href: "https://example.com" }, "二つ目"))),
  );
  assert.equal(hastToMarkdown(tree), "## 設計\n\n認証は **Cookie** で持つ（`auth.ts`）\n\n- 一つ目\n- [二つ目](https://example.com)");
});

test("hastToMarkdown: コードブロックは言語付きの囲みにし、上の帯（言語名・コピー）は入れない", () => {
  const tree = root(
    h(
      "div",
      { className: ["code-block"] },
      h("div", { className: ["code-block-head"] }, h("span", { className: ["code-block-lang"] }, "ts"), h("button", {}, "コピー")),
      h("pre", {}, h("code", { className: ["language-ts"] }, "const a = 1;\n")),
    ),
  );
  assert.equal(hastToMarkdown(tree), "```ts\nconst a = 1;\n```");
});

test("hastToMarkdown: 表は GitHub の書き方の表にする", () => {
  const tree = root(
    h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "名前"), h("th", {}, "値"))), h("tbody", {}, h("tr", {}, h("td", {}, "a"), h("td", {}, "1")))),
  );
  assert.equal(hastToMarkdown(tree), "| 名前 | 値 |\n| -- | - |\n| a  | 1 |");
});

test("hastToMarkdown: 文だけなら文のまま（前後の空白は削る）", () => {
  assert.equal(hastToMarkdown({ type: "root", children: [{ type: "text", value: "  ただの文  " }] }), "ただの文");
});

test("hastToMarkdown: 数式（KaTeX）は書いた式（TeX）に戻す。文の中は $…$、ブロックは $$ の行で挟む", () => {
  // 返答と同じ組（読み方の組と数式の部品）で描いた木
  const pipeline = pipelineOf(undefined, mathPluginsOf(remarkMath, rehypeKatex));
  const markdownOf = (md: string) => hastToMarkdown(markdownToHast(pipeline, md)!);
  assert.equal(markdownOf("a $x^2_{i}$ b"), "a $x^2_{i}$ b");
  assert.equal(markdownOf("$$\n\\frac{a}{b}\n$$"), "$$\n\\frac{a}{b}\n$$");
});

test("hastToMarkdown: 強調・取り消し線の後ろに日本語が続いても、文字参照にせず日本語向けの決まりで読める形に書く", () => {
  const tree = root(
    h("p", {}, h("strong", {}, "「強調」"), "は"),
    h("p", {}, h("strong", {}, "ノート（.md）"), "と", h("del", {}, "取消（x）"), "です"),
  );
  const markdown = hastToMarkdown(tree);
  assert.equal(markdown, "**「強調」**は\n\n**ノート（.md）**と~~取消（x）~~です");
  assert.doesNotMatch(markdown, /&#x/);
});

test("hastToMarkdown: 改行（br）は \\ を付けずに改行だけで書く（表示は 1 回の改行を改行として読む）", () => {
  assert.equal(hastToMarkdown(root(h("p", {}, "行1", h("br", {}), "\n行2"))), "行1\n行2");
});
