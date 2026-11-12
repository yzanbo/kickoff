import assert from "node:assert/strict";
import { test } from "node:test";
import { memoQuote } from "./memoAttachment";

test("memoQuote: 出どころの行の下に、選択部分の引用", () => {
  assert.equal(memoQuote("/メモ/設計/DB.md:3-5", "一行目\n\n二行目 "), "メモ「/メモ/設計/DB.md:3-5」から:\n> 一行目\n>\n> 二行目");
});

