import assert from "node:assert/strict";
import { test } from "node:test";
import { memoAttachment, memoLocation, memoQuote } from "./memoAttachment";

test("memoAttachment: メモ全体の添付（名前はファイル名、種類は拡張子から、大きさは 0）", () => {
  const a = memoAttachment("設計/DB.md");
  assert.deepEqual({ ...a, id: "" }, { id: "", name: "DB.md", mime: "text/markdown", size: 0, memo: "設計/DB.md" });
  assert.match(a.id, /^[0-9a-f-]{36}$/);
  assert.equal(memoAttachment("ページ.html").mime, "text/html");
});

test("memoQuote: 出どころの行の下に、選んだ部分の引用", () => {
  assert.equal(memoQuote("/メモ/設計/DB.md:3-5", "一行目\n\n二行目 "), "メモ「/メモ/設計/DB.md:3-5」から:\n> 一行目\n>\n> 二行目");
});

test("memoLocation: フルパスに行番号を付ける（1 行なら 1 つ、行が分からなければパスだけ）", () => {
  assert.equal(memoLocation("/メモ/DB.md", { from: 3, to: 5 }), "/メモ/DB.md:3-5");
  assert.equal(memoLocation("/メモ/DB.md", { from: 7, to: 7 }), "/メモ/DB.md:7");
  assert.equal(memoLocation("/メモ/DB.md", null), "/メモ/DB.md");
});
