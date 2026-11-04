import assert from "node:assert/strict";
import { test } from "node:test";
import { appendBlock, quoteComment } from "./quoteComment";

test("選んだ範囲へのコメント: 引用にしてコメントを添え、チャット欄の文の後ろに足す", () => {
  assert.equal(quoteComment("  ここは違う  \n\n\n次の行 ", "直して"), "> ここは違う\n>\n> 次の行\n\n直して");
  assert.equal(quoteComment("引用だけ", "  "), "> 引用だけ");
  assert.match(quoteComment("あ".repeat(2000), ""), /^> あ{1500}…$/);
  assert.equal(appendBlock("", "> a"), "> a");
  assert.equal(appendBlock("書きかけ\n\n", "> a"), "書きかけ\n\n> a");
});
