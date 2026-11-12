import assert from "node:assert/strict";
import { test } from "node:test";
import { githubItemRef } from "./githubLinks";

test("githubItemRef: 同じリポジトリの issue・PR は種類と番号（後ろの /files・#… は問わない。持ち主/名前の大文字・小文字は区別しない）", () => {
  assert.deepEqual(githubItemRef("https://github.com/o/r/issues/12", "o/r"), { kind: "issue", number: 12 });
  assert.deepEqual(githubItemRef("https://github.com/o/r/pull/5", "o/r"), { kind: "pr", number: 5 });
  assert.deepEqual(githubItemRef("https://github.com/o/r/pull/5/files#diff-1", "o/r"), { kind: "pr", number: 5 });
  assert.deepEqual(githubItemRef("https://github.com/O/R/issues/3#issuecomment-9", "o/r"), { kind: "issue", number: 3 });
});

test("githubItemRef: ほかのリポジトリ・issue / PR でないページ・リポジトリが分からないときは null（外のブラウザで開く）", () => {
  assert.equal(githubItemRef("https://github.com/x/y/issues/12", "o/r"), null);
  assert.equal(githubItemRef("https://github.com/o/r/commit/abc", "o/r"), null);
  assert.equal(githubItemRef("https://github.com/o/r/issues", "o/r"), null);
  assert.equal(githubItemRef("https://example.com/o/r/issues/1", "o/r"), null);
  assert.equal(githubItemRef("https://github.com/o/r/issues/1", ""), null);
  assert.equal(githubItemRef("https://github.com/o/r-other/issues/1", "o/r"), null);
});

test("githubItemRef: ホストも同じものだけ（GitHub Enterprise ならそのホスト。既定は github.com）", () => {
  assert.deepEqual(githubItemRef("https://ghe.example.com/o/r/pull/5", "o/r", "GHE.example.com"), { kind: "pr", number: 5 });
  assert.equal(githubItemRef("https://github.com/o/r/pull/5", "o/r", "ghe.example.com"), null);
  assert.equal(githubItemRef("https://ghe.example.com/o/r/pull/5", "o/r"), null);
});
