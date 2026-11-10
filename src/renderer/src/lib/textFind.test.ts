import assert from "node:assert/strict";
import { test } from "node:test";
import { findInTexts, findOptionOfKey, findPattern, spansIn, stepMatch } from "./textFind";

test("findInTexts: ノードごとに、大文字・小文字を区別せず前から順に合う位置を返す（重ならない）", () => {
  assert.deepEqual(findInTexts(["Abc abc", "x", "ABCabc"], "abc"), [
    { node: 0, start: 0, end: 3 },
    { node: 0, start: 4, end: 7 },
    { node: 2, start: 0, end: 3 },
    { node: 2, start: 3, end: 6 },
  ]);
  assert.deepEqual(findInTexts(["aaaa"], "aa"), [
    { node: 0, start: 0, end: 2 },
    { node: 0, start: 2, end: 4 },
  ]);
  assert.deepEqual(findInTexts(["日本語の文"], "語の"), [{ node: 0, start: 2, end: 4 }]);
  assert.deepEqual(findInTexts(["abc"], ""), []);
});

test("findInTexts: 正規表現を使わないときは、記号もそのままの文字として探す", () => {
  assert.deepEqual(findInTexts(["a.b axb (x)"], "a.b"), [{ node: 0, start: 0, end: 3 }]);
  assert.deepEqual(findInTexts(["(x) [y]"], "(x)"), [{ node: 0, start: 0, end: 3 }]);
});

test("findInTexts: 大文字・小文字を区別する", () => {
  const opts = { caseSensitive: true, wholeWord: false, regex: false };
  assert.deepEqual(findInTexts(["Kickoff KICKOFF kickoff"], "KICKOFF", opts), [{ node: 0, start: 8, end: 15 }]);
});

test("findInTexts: 単語単位では、前後が文字・数字・_ のところは合わない", () => {
  const opts = { caseSensitive: false, wholeWord: true, regex: false };
  assert.deepEqual(findInTexts(["cat concat cat_x cat. Cat"], "cat", opts), [
    { node: 0, start: 0, end: 3 },
    { node: 0, start: 17, end: 20 },
    { node: 0, start: 22, end: 25 },
  ]);
});

test("findInTexts: 正規表現で探し、長さは合ったものの長さ。幅 0 の一致は飛ばす", () => {
  const opts = { caseSensitive: false, wholeWord: false, regex: true };
  assert.deepEqual(findInTexts(["a1 b22 c333"], String.raw`\d+`, opts), [
    { node: 0, start: 1, end: 2 },
    { node: 0, start: 4, end: 6 },
    { node: 0, start: 8, end: 11 },
  ]);
  assert.deepEqual(findInTexts(["abc"], "x*", opts), []);
  // 正規表現と単語単位を合わせる
  assert.deepEqual(findInTexts(["foo foobar bar"], "foo|bar", { ...opts, wholeWord: true }), [
    { node: 0, start: 0, end: 3 },
    { node: 0, start: 11, end: 14 },
  ]);
});

test("findPattern: 空なら null、正規表現として読めなければ誤りを返し、何も探さない", () => {
  assert.equal(findPattern(""), null);
  const bad = findPattern("(", { caseSensitive: false, wholeWord: false, regex: true });
  assert.ok(bad && "error" in bad);
  assert.deepEqual(spansIn("(((", bad), []);
  // 正規表現でなければ同じ文字も探せる
  assert.deepEqual(spansIn("a(b", findPattern("(")), [{ start: 1, end: 2 }]);
});

test("findOptionOfKey: ⌥⌘C / ⌥⌘W / ⌥⌘R を探し方の切り替えに読み、ほかの修飾キーが付けば読まない", () => {
  const key = (code: string, mods: Partial<{ metaKey: boolean; altKey: boolean; ctrlKey: boolean; shiftKey: boolean }> = {}) => ({ code, metaKey: true, altKey: true, ctrlKey: false, shiftKey: false, ...mods });
  assert.equal(findOptionOfKey(key("KeyC")), "caseSensitive");
  assert.equal(findOptionOfKey(key("KeyW")), "wholeWord");
  assert.equal(findOptionOfKey(key("KeyR")), "regex");
  assert.equal(findOptionOfKey(key("KeyX")), null);
  assert.equal(findOptionOfKey(key("KeyC", { altKey: false })), null);
  assert.equal(findOptionOfKey(key("KeyC", { shiftKey: true })), null);
});

test("stepMatch: 端で回り込み、まだ選んでいなければ次は最初・前は最後", () => {
  assert.equal(stepMatch(null, 3, 1), 0);
  assert.equal(stepMatch(null, 3, -1), 2);
  assert.equal(stepMatch(2, 3, 1), 0);
  assert.equal(stepMatch(0, 3, -1), 2);
  assert.equal(stepMatch(null, 0, 1), null);
});
