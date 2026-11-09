import assert from "node:assert/strict";
import { test } from "node:test";
import { matchCase, replaceInLine, searchPattern, splitMatches, splitReplacements } from "./searchMatch";

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

const plain = { regex: false, preserveCase: false };

test("置換: 文字のままの置換は $ をそのまま使い、行の中のすべてを置き換える", () => {
  assert.deepEqual(replaceInLine("foo foo", q("foo")!, "$1x", plain), { text: "$1x $1x", count: 2 });
  assert.deepEqual(replaceInLine("abc", q("z")!, "y", plain), { text: "abc", count: 0 });
});

test("置換: 正規表現では $1・$&・$<名前>・$$・\\n を使える", () => {
  const re = (query: string) => q(query, { regex: true })!;
  const opts = { regex: true, preserveCase: false };
  assert.equal(replaceInLine("a=1, b=2", re("(\\w)=(\\d)"), "$2:$1", opts).text, "1:a, 2:b");
  assert.equal(replaceInLine("cat", re("a"), "[$&]", opts).text, "c[a]t");
  assert.equal(replaceInLine("x1", re("(?<n>\\d)"), "<$<n>>", opts).text, "x<1>");
  assert.equal(replaceInLine("x", re("x"), "$$", opts).text, "$");
  assert.equal(replaceInLine("a,b", re(","), "\\n", opts).text, "a\nb");
  // $12 で組が 1 つなら、$1 と「2」
  assert.equal(replaceInLine("ab", re("(a)"), "$12", opts).text, "a2b");
});

test("置換: 大文字・小文字を保つ（すべて大文字・すべて小文字・頭だけ大文字）", () => {
  assert.equal(matchCase("FOO", "bar"), "BAR");
  assert.equal(matchCase("foo", "Bar"), "bar");
  assert.equal(matchCase("Foo", "bar"), "Bar");
  assert.equal(matchCase("fOo", "bar"), "bar");
  assert.equal(matchCase("123", "bar"), "bar");
  assert.equal(replaceInLine("Foo foo FOO", q("foo")!, "bar", { regex: false, preserveCase: true }).text, "Bar bar BAR");
});

test("置換のプレビュー: 見つかった部分に置き換える文を添える", () => {
  assert.deepEqual(splitReplacements("a-b", q("-")!, "+", plain), [
    { text: "a", match: false },
    { text: "-", match: true, replacement: "+" },
    { text: "b", match: false },
  ]);
});
