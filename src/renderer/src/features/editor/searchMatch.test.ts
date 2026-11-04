import assert from "node:assert/strict";
import { test } from "node:test";
import { searchPattern, splitMatches } from "./searchMatch";

const q = (query: string, opts: Partial<{ case_sensitive: boolean; whole_word: boolean; regex: boolean }> = {}) =>
  searchPattern({ query, case_sensitive: false, whole_word: false, regex: false, ...opts });

test("検索の指定（大文字と小文字・単語単位・正規表現）どおりに、見つかった部分を分ける", () => {
  assert.deepEqual(splitMatches("Hello hello", q("hello")), [
    { text: "Hello", match: true },
    { text: " ", match: false },
    { text: "hello", match: true },
  ]);
  assert.deepEqual(splitMatches("Hello hello", q("hello", { case_sensitive: true })), [
    { text: "Hello ", match: false },
    { text: "hello", match: true },
  ]);
  assert.deepEqual(splitMatches("shell ell", q("ell", { whole_word: true })), [
    { text: "shell ", match: false },
    { text: "ell", match: true },
  ]);
  assert.deepEqual(splitMatches("a.b axb", q("a.b")), [
    { text: "a.b", match: true },
    { text: " axb", match: false },
  ]);
  assert.equal(splitMatches("a.b axb", q("a.b", { regex: true })).filter((p) => p.match).length, 2);
});

test("正しくない正規表現・長さ 0 の一致では、印を付けない", () => {
  assert.equal(q("(", { regex: true }), null);
  assert.deepEqual(splitMatches("abc", q("^", { regex: true })), [{ text: "abc", match: false }]);
});
