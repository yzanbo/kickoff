import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { markdownToHtml } from "./markdownHtml";
import { pipelineOf, renderMarkdown } from "./markdownProcessor";
import { splitBlocks } from "./streaming/markdownBlocks";

test("書式付きコピー: 見出し・表・コード・リストを HTML にし、文中の HTML は文字として書く", () => {
  const html = markdownToHtml("# 見出し\n\n| 名前 | 値 |\n| --- | --- |\n| a | 1 |\n\n- 項目\n\n```ts\nconst x = 1;\n```\n\n<script>alert(1)</script>");
  assert.match(html, /<h1>見出し<\/h1>/);
  assert.match(html, /<table>[\s\S]*<th>名前<\/th>[\s\S]*<td>a<\/td>/);
  assert.match(html, /<li>項目<\/li>/);
  assert.match(html, /<pre><code class="language-ts">const x = 1;\n<\/code><\/pre>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&#x3C;script>alert\(1\)&#x3C;\/script>/);
});

test("書式付きコピー: 表示と同じ読み方（日本語の強調・~ 1 つ・URL の切れ目・1 回の改行・脚注の文言）", () => {
  const text =
    "**「強調」**は（https://example.com）を開く。所要時間は5~10秒\n行2\n\n- **ノート（.md）**と~~取消（x）~~です\n\n注[^1]\n\n[^1]: 脚注の本文\n\n<b title=\"x\">太</b> と [危ない](javascript:alert(1))";
  const html = markdownToHtml(text);
  // 表示（ファイルのチップ・数式なしの Markdown の部品）と同じ HTML
  const shown = splitBlocks(text)
    .map((b) => renderToStaticMarkup(renderMarkdown(pipelineOf(undefined, null), b, {})))
    .join("\n");
  // 書き出し方の違い（自分で閉じる印・文字参照の形・真偽の属性）だけをそろえて比べる
  const normalize = (s: string) =>
    s
      .replace(/<br\/>/g, "<br>")
      .replace(/&#x3C;/g, "&lt;")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/="true"/g, "");
  assert.equal(normalize(html), normalize(shown));
  assert.match(html, /<strong>「強調」<\/strong>は（<a href="https:\/\/example.com">https:\/\/example.com<\/a>）を開く。所要時間は5~10秒<br>\n行2/);
  assert.match(html, /<h2 class="sr-only" id="footnote-label">脚注<\/h2>/);
  assert.doesNotMatch(html, /javascript:/);
});

test("書式付きコピー: 数式は式の文字のまま、読むと危ない形のブロックは書いたままの文字", () => {
  assert.match(markdownToHtml("式 $x^2$ です"), /<p>式 \$x\^2\$ です<\/p>/);
  const risky = "*a".repeat(7000);
  assert.equal(markdownToHtml(`前\n\n${risky}`), `<p>前</p>\n<p>${risky}</p>`);
});
