import assert from "node:assert/strict";
import { test } from "vitest";
import { noteExtensionOf, noteKindOf, newHtmlNote } from "./kinds";

test("noteKindOf: .html・.htm は HTML、ほかは Markdown（大文字も）", () => {
  assert.equal(noteKindOf("資料/計画.html"), "html");
  assert.equal(noteKindOf("ページ.HTM"), "html");
  assert.equal(noteKindOf("設計.md"), "markdown");
  assert.equal(noteKindOf("ただのテキスト.txt"), "markdown");
});

test("noteExtensionOf: ノートの拡張子だけを返す（名前が拡張子だけなら null）", () => {
  assert.equal(noteExtensionOf("a/計画.HTML"), ".html");
  assert.equal(noteExtensionOf("a.markdown"), ".markdown");
  assert.equal(noteExtensionOf("図.png"), null);
  assert.equal(noteExtensionOf(".md"), null);
  assert.equal(noteExtensionOf("a/.html"), null);
});

test("newHtmlNote: 題名を HTML の文字にして見出しと title に入れる", () => {
  const html = newHtmlNote("A & <B>");
  assert.match(html, /<title>A &amp; &lt;B&gt;<\/title>/);
  assert.match(html, /<h1>A &amp; &lt;B&gt;<\/h1>/);
  assert.match(html, /<style>/);
});
