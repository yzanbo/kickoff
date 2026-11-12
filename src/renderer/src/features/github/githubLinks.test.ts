import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultGitHubFilter } from "@shared/github/searchQuery";
import { githubItemRef, githubListUrl, githubRepoUrl } from "./githubLinks";

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

test("githubRepoUrl・githubListUrl: リポジトリのページと、いまの絞り込みの一覧のページ（issue は /issues・PR は /pulls。repo: は外す）", () => {
  assert.equal(githubRepoUrl("github.com", "o/r"), "https://github.com/o/r");
  assert.equal(githubRepoUrl("GHE.example.com", "o/r"), "https://ghe.example.com/o/r");
  assert.equal(githubListUrl("github.com", "o/r", defaultGitHubFilter("issue")), `https://github.com/o/r/issues?q=${encodeURIComponent("is:issue is:open sort:updated-desc")}`);
  const pr = { ...defaultGitHubFilter("pr"), state: "merged" as const, labels: ["bug fix"], text: "login" };
  assert.equal(githubListUrl("github.com", "o/r", pr), `https://github.com/o/r/pulls?q=${encodeURIComponent('is:pr is:merged label:"bug fix" sort:updated-desc login')}`);
});
