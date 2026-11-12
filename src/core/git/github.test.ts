// gh の応答の読み方
import assert from "node:assert/strict";
import { test } from "node:test";
import { toPullRequestInfo, withClosingRefs } from "./github.js";

test("PR の JSON: gh の camelCase（isDraft）を API の is_draft にする（ないときは下書きでない）", () => {
  const base = { number: 3, url: "https://github.com/o/r/pull/3", title: "直す", state: "OPEN" as const };
  assert.deepEqual(toPullRequestInfo({ ...base, isDraft: true }), { ...base, is_draft: true });
  assert.equal(toPullRequestInfo(base).is_draft, false);
});

test("PR の本文に Closes を足す: 終わりに 1 行ずつ・番号の順・書いてある番号（closes / fixes / resolves）は足さない・足すものがなければ null", () => {
  assert.equal(withClosingRefs("本文\n", [12, 3, 12]), "本文\n\nCloses #3\nCloses #12");
  assert.equal(withClosingRefs("", [5]), "Closes #5");
  assert.equal(withClosingRefs("Fixes #5 です", [5, 6]), "Fixes #5 です\n\nCloses #6");
  assert.equal(withClosingRefs("resolved #7", [7]), null);
  assert.equal(withClosingRefs("#7 のこと", [7]), "#7 のこと\n\nCloses #7");
  assert.equal(withClosingRefs("本文", []), null);
});
