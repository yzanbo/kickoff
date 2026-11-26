import assert from "node:assert/strict";
import { test } from "vitest";
import { HTML_CONTAINER_TAGS, HTML_TAGS } from "@/foundation/ui/markdown/html/htmlAllowlist";
import { htmlContainerDelta, rawHtmlBlockEnd } from "./htmlBlockDepth";

test("HTML_CONTAINER_TAGS: まとめる入れ物は、描く側が要素にするタグだけ（閉じを省ける li・td などは入れない）", () => {
  for (const tag of HTML_CONTAINER_TAGS) assert.ok(HTML_TAGS.has(tag), tag);
  for (const tag of ["li", "td", "tr", "p", "dd"]) assert.ok(!HTML_CONTAINER_TAGS.includes(tag), tag);
});

test("htmlContainerDelta: 入れ物の開きから閉じを引く（自分で閉じるもの・文の中のコード・名前の続く別のタグは数えない）", () => {
  assert.equal(htmlContainerDelta("<details><summary>a</summary>"), 1);
  assert.equal(htmlContainerDelta("</div></details>"), -2);
  assert.equal(htmlContainerDelta('<div class="x"><table>'), 2);
  assert.equal(htmlContainerDelta("<div/> <divider> <ul2>"), 0);
  assert.equal(htmlContainerDelta("`<div>` は文字"), 0);
  assert.equal(htmlContainerDelta("<li><td>"), 0);
});

test("rawHtmlBlockEnd: 空行をまたぐ HTML ブロックの終わりの印（同じ行で終われば null・始まらなければ undefined）", () => {
  assert.ok(rawHtmlBlockEnd("<pre>")?.test("</pre>"));
  assert.ok(rawHtmlBlockEnd("<!-- メモ")?.test("-->"));
  assert.equal(rawHtmlBlockEnd("<script>x</script>"), null);
  assert.equal(rawHtmlBlockEnd("<!-- 1 行 -->"), null);
  assert.equal(rawHtmlBlockEnd("    <pre>"), undefined);
  assert.equal(rawHtmlBlockEnd("<div>"), undefined);
});
