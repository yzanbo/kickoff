import assert from "node:assert/strict";
import { test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { markdownToHtml } from "./markdownHtml";
import { pipelineOf, renderBlock } from "./markdownProcessor";
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

test("書式付きコピー: 表示と同じ読み方（日本語の強調・~ 1 つ・URL の切れ目・1 回の改行・脚注）。脚注の隠す見出しは入れない", () => {
  const text =
    "**「強調」**は（https://example.com）を開く。所要時間は5~10秒\n行2\n\n- **ノート（.md）**と~~取消（x）~~です\n\n注[^1]\n\n[^1]: 脚注の本文\n\n<b title=\"x\">太</b> と [危ない](javascript:alert(1))";
  const html = markdownToHtml(text);
  // 表示（ファイルのチップ・数式なしの Markdown の部品）と同じ HTML
  const shown = splitBlocks(text)
    .map((b) => renderToStaticMarkup(renderBlock(pipelineOf(undefined, null), b, {}).element))
    .join("\n");
  // 書き出し方の違い（自分で閉じる印・文字参照の形・真偽の属性・コピーに書かない HTML の要素の印）だけをそろえて比べる
  const normalize = (s: string) =>
    s
      .replace(/ class="md-html"/g, "")
      .replace(/<h2 class="sr-only" id="footnote-label">脚注<\/h2>/, "")
      .replace(/<br\/>/g, "<br>")
      .replace(/&#x3C;/g, "&lt;")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/="true"/g, "");
  assert.equal(normalize(html), normalize(shown));
  assert.match(html, /<strong>「強調」<\/strong>は（<a href="https:\/\/example.com">https:\/\/example.com<\/a>）を開く。所要時間は5~10秒<br>\n行2/);
  // 脚注の見出しは画面では読み上げ用に隠すもの。貼った先には隠す CSS がないので入れない（脚注の欄と戻る印の説明は入れる）
  assert.doesNotMatch(html, /sr-only|<h2/);
  assert.match(html, /<section data-footnotes class="footnotes">\n<ol>/);
  assert.match(html, /aria-label="本文の注 1 へ戻る"/);
  assert.doesNotMatch(html, /javascript:/);
});

test("書式付きコピー: 数式は式の文字のまま、読むと危ない形のブロックは書いたままの文字", () => {
  assert.match(markdownToHtml("式 $x^2$ です"), /<p>式 \$x\^2\$ です<\/p>/);
  const risky = "*a".repeat(7000);
  assert.equal(markdownToHtml(`前\n\n${risky}`), `<p>前</p>\n<p>${risky}</p>`);
});

test("書式付きコピー: 文中の HTML は一覧を通した結果だけを書く（id・Kickoff の印は書かない・たたむ部分は中身ごと・値と文字はエスケープ）", () => {
  const html = markdownToHtml(
    '<p id="top" onclick="x()" title="a&quot;<b>">段落</p>\n\n<details>\n<summary>題</summary>\n\n中身 <kbd>K</kbd>\n\n</details>\n\n<a href="javascript:alert(1)">危</a> <a href="https://example.com/?a=1&b=2">安</a> <iframe src="https://evil.example"></iframe>',
  );
  assert.match(html, /<p title="a&#x22;<b>">段落<\/p>/);
  assert.match(html, /<details>\n<summary>題<\/summary>\n<p>中身 <kbd>K<\/kbd><\/p>\n<\/details>/);
  assert.match(html, /<a>危<\/a> <a href="https:\/\/example.com\/\?a=1&#x26;b=2">安<\/a> &#x3C;iframe src="https:\/\/evil.example">&#x3C;\/iframe>/);
  assert.doesNotMatch(html, /id=|class="md-html"|onclick|javascript:/);
});
