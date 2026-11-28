import assert from "node:assert/strict";
import { test } from "vitest";
import { decodeEntity, inlineHtmlRanges } from "./inlineSyntax";
import { noteMarkdownParser } from "./noteMarkdown";

const rangesOf = (text: string) => inlineHtmlRanges(noteMarkdownParser.parse(text), text).map((r) => text.slice(r.from, r.to));

test("inlineHtmlRanges: 一覧のタグで同じ行で開きと閉じがそろったもの・閉じの要らないタグ（外側の組だけ）", () => {
  assert.deepEqual(rangesOf("改行<br>あり と <kbd>⌘</kbd>+<kbd>K</kbd>"), ["<br>", "<kbd>⌘</kbd>", "<kbd>K</kbd>"]);
  assert.deepEqual(rangesOf("<sub>a<b>b</b></sub> と <br/>"), ["<sub>a<b>b</b></sub>", "<br/>"]);
});

test("inlineHtmlRanges: 閉じのないもの・一覧にないタグ・大文字のタグは文字のまま", () => {
  assert.deepEqual(rangesOf("<kbd>閉じない と <script>x</script> と <KBD>y</KBD>"), []);
  assert.deepEqual(rangesOf("<b>a</i>"), []);
});

test("decodeEntity: 名前・10 進・16 進の実体参照（読めないものは null）", () => {
  assert.equal(decodeEntity("&amp;"), "&");
  assert.equal(decodeEntity("&#38;"), "&");
  assert.equal(decodeEntity("&#x1F600;"), "😀");
  assert.equal(decodeEntity("&#0;"), "�");
  assert.equal(decodeEntity("&nosuch;"), null);
});
