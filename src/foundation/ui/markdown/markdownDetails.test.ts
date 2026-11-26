import assert from "node:assert/strict";
import { test } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, null, text));

test("たたむ部分: 閉じている間は中身を画面に置かない（選んだ部分の Markdown・検索・画像の読み込みに入らない）", () => {
  const closed = html("<details>\n<summary>題</summary>\n\n秘密の**本文**\n\n<img src=\"https://example.com/a.png\">\n\n</details>");
  assert.match(closed, /<details class="md-html"><summary class="md-html">題<\/summary><\/details>/);
  assert.doesNotMatch(closed, /秘密|<img/);
  // open なら初めから開いて中身を描く（中の Markdown も描く）
  const open = html("<details open>\n<summary>題</summary>\n\n秘密の**本文**\n\n</details>");
  assert.match(open, /<details class="md-html" open=""><summary class="md-html">題<\/summary>[\s\S]*<p>秘密の<strong>本文<\/strong><\/p>/);
});

test("たたむ部分: summary がない・空なら「詳細」と出す。ontoggle などの属性は付けない", () => {
  assert.match(html("<details>\n\n本文\n\n</details>"), /<details class="md-html"><summary class="md-html">詳細<\/summary><\/details>/);
  assert.match(html("<details><summary> </summary>x</details>"), /<summary class="md-html">詳細<\/summary>/);
  assert.match(html('<details ontoggle="alert(1)"><summary onclick="x">題</summary>x</details>'), /^<div class="markdown"><details class="md-html"><summary class="md-html">題<\/summary><\/details><\/div>$/);
  // 2 つ目の summary・details の外の summary は文字のまま
  assert.match(html("<details open><summary>a</summary><summary>b</summary></details>"), /&lt;summary&gt;b&lt;\/summary&gt;/);
  assert.match(html("<summary>外</summary>"), /&lt;summary&gt;外&lt;\/summary&gt;/);
});
