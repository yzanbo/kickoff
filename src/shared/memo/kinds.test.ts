import assert from "node:assert/strict";
import { test } from "node:test";
import { memoExtensionOf, memoKindOf, newHtmlMemo } from "./kinds";

test("memoKindOf: .html・.htm は HTML、ほかは Markdown（大文字も）", () => {
  assert.equal(memoKindOf("資料/計画.html"), "html");
  assert.equal(memoKindOf("ページ.HTM"), "html");
  assert.equal(memoKindOf("設計.md"), "markdown");
  assert.equal(memoKindOf("ただのテキスト.txt"), "markdown");
});

test("memoExtensionOf: メモの拡張子だけを返す（名前が拡張子だけなら null）", () => {
  assert.equal(memoExtensionOf("a/計画.HTML"), ".html");
  assert.equal(memoExtensionOf("a.markdown"), ".markdown");
  assert.equal(memoExtensionOf("図.png"), null);
  assert.equal(memoExtensionOf(".md"), null);
  assert.equal(memoExtensionOf("a/.html"), null);
});

test("newHtmlMemo: 題名を HTML の文字にして見出しと title に入れる", () => {
  const html = newHtmlMemo("A & <B>");
  assert.match(html, /<title>A &amp; &lt;B&gt;<\/title>/);
  assert.match(html, /<h1>A &amp; &lt;B&gt;<\/h1>/);
  assert.match(html, /<style>/);
});
