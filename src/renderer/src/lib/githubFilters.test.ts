import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_GITHUB_FILTERS, activeFilterCount, parseGitHubFilters } from "./githubFilters";

test("parseGitHubFilters: 壊れた項目は既定に戻し、種類は issue / PR のどちらか", () => {
  assert.equal(parseGitHubFilters("x"), undefined);
  const f = parseGitHubFilters({ kind: "pr", pr: { state: "merged", mine: "review_requested", labels: ["bug", 3], sort: "nope", text: "fix" }, issue: null });
  assert.equal(f?.kind, "pr");
  assert.deepEqual(f?.issue, DEFAULT_GITHUB_FILTERS.issue);
  assert.equal(f?.pr.state, "merged");
  assert.equal(f?.pr.mine, "review_requested");
  assert.deepEqual(f?.pr.labels, ["bug"]);
  assert.equal(f?.pr.sort, "updated");
  assert.equal(f?.pr.kind, "pr");
  assert.equal(parseGitHubFilters({ kind: "discussion" })?.kind, "issue");
});

test("parseGitHubFilters: 前の形の 1 つだけの担当・マイルストーンも読む", () => {
  const f = parseGitHubFilters({ kind: "issue", issue: { assignee: "alice", milestone: " v1 " } });
  assert.deepEqual(f?.issue.assignees, ["alice"]);
  assert.deepEqual(f?.issue.milestones, ["v1"]);
  const g = parseGitHubFilters({ kind: "issue", issue: { assignees: ["a", "", 1, "b"], milestones: [] } });
  assert.deepEqual(g?.issue.assignees, ["a", "b"]);
  assert.deepEqual(g?.issue.milestones, []);
});

test("activeFilterCount: 既定から変えた絞り込みの数（並べ方は数えない）", () => {
  assert.equal(activeFilterCount(DEFAULT_GITHUB_FILTERS.issue), 0);
  assert.equal(activeFilterCount({ ...DEFAULT_GITHUB_FILTERS.issue, sort: "created" }), 0);
  assert.equal(activeFilterCount({ ...DEFAULT_GITHUB_FILTERS.issue, state: "all", labels: ["a"], text: " x " }), 3);
});
