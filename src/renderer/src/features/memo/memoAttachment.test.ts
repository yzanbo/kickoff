import assert from "node:assert/strict";
import { test } from "node:test";
import { memoAttachment, memoQuote } from "./memoAttachment";

test("memoAttachment: メモ全体の添付（名前はファイル名、種類は拡張子から、大きさは 0）", () => {
  const a = memoAttachment("設計/DB.md");
  assert.deepEqual({ ...a, id: "" }, { id: "", name: "DB.md", mime: "text/markdown", size: 0, memo: "設計/DB.md" });
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.equal(memoAttachment("ページ.html").mime, "text/html");
});

test("memoQuote: 出どころの行の下に、選んだ部分の引用", () => {
  assert.equal(memoQuote("設計/DB.md", "一行目\n\n二行目 "), "メモ「設計/DB.md」から:\n> 一行目\n>\n> 二行目");
});
