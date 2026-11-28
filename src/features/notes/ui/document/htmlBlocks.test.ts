import assert from "node:assert/strict";
import { test } from "vitest";
import { htmlBlocks } from "./htmlBlocks";
import { noteMarkdownParser } from "./noteMarkdown";

const blocksOf = (text: string) => htmlBlocks(noteMarkdownParser.parse(text), text).map((b) => b.source);

test("htmlBlocks: 入れ物のタグは開きから閉じまで（空行と中の Markdown も）を 1 つに", () => {
  const details = "<details>\n<summary>見出し</summary>\n\n- 中の **項目**\n\n</details>";
  assert.deepEqual(blocksOf(`前\n\n${details}\n\n後`), [details]);
  assert.deepEqual(blocksOf("<div>\n<div>入れ子</div>\n</div>"), ["<div>\n<div>入れ子</div>\n</div>"]);
});

test("htmlBlocks: 閉じないもの・一覧にないタグ・コメントはまとめない", () => {
  assert.deepEqual(blocksOf("<details>\n閉じない"), []);
  assert.deepEqual(blocksOf("<script>\nx\n</script>"), []);
  assert.deepEqual(blocksOf("<!-- コメント -->"), []);
  assert.deepEqual(blocksOf("<hr>"), ["<hr>"]);
});
