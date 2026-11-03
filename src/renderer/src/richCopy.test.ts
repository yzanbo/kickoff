import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownToHtml } from "./richCopy";

test("書式付きコピー: 見出し・表・コード・リストを HTML にし、文中の HTML は文字として書く", () => {
  const html = markdownToHtml("# 見出し\n\n| 名前 | 値 |\n| --- | --- |\n| a | 1 |\n\n- 項目\n\n```ts\nconst x = 1;\n```\n\n<script>alert(1)</script>");
  assert.match(html, /<h1>見出し<\/h1>/);
  assert.match(html, /<table>[\s\S]*<th>名前<\/th>[\s\S]*<td>a<\/td>/);
  assert.match(html, /<li>項目<\/li>/);
  assert.match(html, /<pre><code class="language-ts">const x = 1;\n<\/code><\/pre>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
