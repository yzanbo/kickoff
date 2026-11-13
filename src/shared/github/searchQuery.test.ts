// GitHub タブの絞り込み → 検索の文
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubListFilter } from "../types/github";
import { defaultGitHubFilter, githubSearchQuery, githubSearchText, mineFiltersFor, parseGitHubSearchText, searchValue } from "./searchQuery";

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
  const issue = { ...defaultGitHubFilter("issue"), state: "all" as const, mine: "review_requested" as const, assignees: ["alice"], milestones: ["v1.0 リリース"] };
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

test("githubSearchQuery: 担当・マイルストーンの複数は「どれか」（OR のまとまり）", () => {
  const f = { ...defaultGitHubFilter("issue"), assignees: ["alice", "bob"], milestones: ["v1", "v2 春"] };
  assert.equal(githubSearchQuery("o/r", f), 'repo:o/r is:issue is:open (assignee:alice OR assignee:bob) (milestone:v1 OR milestone:"v2 春") sort:updated-desc');
});

test("githubSearchText: 欄に出す文はリポジトリ・種類を出さず、並べ方は既定から変えたときだけ", () => {
  assert.equal(githubSearchText(defaultGitHubFilter("issue")), "is:open");
  assert.equal(githubSearchText({ ...defaultGitHubFilter("pr"), state: "all", labels: ["bug"], sort: "comments", text: "fix" }), "label:bug sort:comments-desc fix");
});

test("parseGitHubSearchText: 文から札に戻す（札にならない語は検索の文に残す）", () => {
  const f = parseGitHubSearchText("pr", 'is:closed is:unmerged review-requested:@me label:"good first issue" (assignee:a OR assignee:b) milestone:v1 sort:created-desc is:draft fix');
  assert.equal(f.state, "closed");
  assert.equal(f.mine, "review_requested");
  assert.deepEqual(f.labels, ["good first issue"]);
  assert.deepEqual(f.assignees, ["a", "b"]);
  assert.deepEqual(f.milestones, ["v1"]);
  assert.equal(f.sort, "created");
  assert.equal(f.text, "is:draft fix");
  // 状態の語がなければ「すべて」・並べ方がなければ既定
  const g = parseGitHubSearchText("issue", "crash");
  assert.equal(g.state, "all");
  assert.equal(g.sort, "updated");
  assert.equal(g.text, "crash");
  // issue にマージ済み・レビュー依頼はない。2 つ目の担当は「すべて」の意味になるので文のまま。OR のまとまりに別の語が混ざれば文のまま
  const h = parseGitHubSearchText("issue", "is:merged review-requested:@me assignee:a assignee:b (assignee:c OR label:x) sort:created-asc");
  assert.equal(h.state, "all");
  assert.equal(h.mine, null);
  assert.deepEqual(h.assignees, ["a"]);
  assert.equal(h.text, "is:merged review-requested:@me assignee:b (assignee:c OR label:x) sort:created-asc");
});

test("parseGitHubSearchText: 札の文に戻すと同じ絞り込みになる", () => {
  const filters: GitHubListFilter[] = [
    defaultGitHubFilter("issue"),
    { ...defaultGitHubFilter("pr"), state: "merged", mine: "created", labels: ["a b", "c"], assignees: ["x", "y"], milestones: ["v 1"], sort: "comments", text: "is:draft word" },
    { ...defaultGitHubFilter("pr"), state: "closed", mine: "assigned", text: "" },
    { ...defaultGitHubFilter("issue"), state: "all", milestones: ["m1", "m2"], text: "-label:wontfix" },
  ];
  for (const f of filters) assert.deepEqual(parseGitHubSearchText(f.kind, githubSearchText(f)), f);
});
