// GitHub タブの絞り込み → 検索の文
import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultGitHubFilter, githubSearchQuery, mineFiltersFor, searchValue } from "./searchQuery";

test("githubSearchQuery: 既定は開いているもの・更新が新しい順", () => {
  assert.equal(githubSearchQuery("o/r", defaultGitHubFilter("issue")), "repo:o/r is:issue is:open sort:updated-desc");
  assert.equal(githubSearchQuery("o/r", defaultGitHubFilter("pr")), "repo:o/r is:pr is:open sort:updated-desc");
});

test("githubSearchQuery: 状態・自分・ラベル・担当・マイルストーン・並べ方・検索の文", () => {
  const pr = { ...defaultGitHubFilter("pr"), state: "closed" as const, mine: "review_requested" as const, labels: ["bug", "good first issue"], sort: "comments" as const, text: " is:draft fix " };
  assert.equal(
    githubSearchQuery("o/r", pr),
    'repo:o/r is:pr is:closed is:unmerged review-requested:@me label:bug label:"good first issue" sort:comments-desc is:draft fix',
  );
  assert.equal(githubSearchQuery("o/r", { ...defaultGitHubFilter("pr"), state: "merged" }), "repo:o/r is:pr is:merged sort:updated-desc");
  const issue = { ...defaultGitHubFilter("issue"), state: "all" as const, mine: "review_requested" as const, assignee: "alice", milestone: "v1.0 リリース" };
  // issue にレビュー依頼はないので付けない。merged も issue にはない
  assert.equal(githubSearchQuery("o/r", issue), 'repo:o/r is:issue assignee:alice milestone:"v1.0 リリース" sort:updated-desc');
  assert.equal(githubSearchQuery("o/r", { ...defaultGitHubFilter("issue"), state: "merged" }), "repo:o/r is:issue sort:updated-desc");
});

test("searchValue・mineFiltersFor", () => {
  assert.equal(searchValue("v1.0"), "v1.0");
  assert.equal(searchValue('a "b"'), '"a b"');
  assert.deepEqual(mineFiltersFor("issue"), ["assigned", "created", "mentioned"]);
  assert.ok(mineFiltersFor("pr").includes("review_requested"));
});
