// GitHub の答え → GitHub タブの API の形
import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandError } from "../system/exec.js";
import { GH_LOGGED_OUT, GH_MISSING, ghFailureMessage, parseIncludeOutput } from "./ghApi.js";
import { checksStateOf, eventText, toCheck, toItem, toPullFile, toThreads, toTimeline } from "./normalize.js";

const user = (login: string) => ({ login, avatarUrl: `https://a/${login}` });

test("toItem: issue と PR の 1 件（状態は小文字・閉じ方・PR だけの項目・CI のまとめ）", () => {
  const issue = toItem({
    __typename: "Issue",
    number: 3,
    title: "壊れた",
    state: "CLOSED",
    stateReason: "NOT_PLANNED",
    url: "u",
    createdAt: "c",
    updatedAt: "u2",
    closedAt: "x",
    author: user("a"),
    labels: { nodes: [{ name: "bug", color: "d73a4a" }] },
    assignees: { nodes: [user("b")] },
    milestone: { title: "v1" },
    comments: { totalCount: 2 },
  });
  assert.equal(issue?.kind, "issue");
  assert.equal(issue?.state, "closed");
  assert.equal(issue?.state_reason, "not_planned");
  assert.deepEqual(issue?.labels, [{ name: "bug", color: "d73a4a" }]);
  assert.deepEqual(issue?.assignees, [{ login: "b", avatar_url: "https://a/b" }]);
  assert.equal(issue?.milestone, "v1");
  assert.equal(issue?.checks, null);

  const pr = toItem({
    __typename: "PullRequest",
    number: 4,
    title: "直す",
    state: "MERGED",
    isDraft: true,
    reviewDecision: "CHANGES_REQUESTED",
    headRefName: "fix",
    baseRefName: "main",
    author: null,
    labels: { nodes: [] },
    assignees: { nodes: [] },
    comments: { totalCount: 0 },
    commits: { nodes: [{ commit: { statusCheckRollup: { state: "ERROR" } } }] },
  });
  assert.equal(pr?.kind, "pr");
  assert.equal(pr?.state, "merged");
  assert.equal(pr?.is_draft, true);
  assert.equal(pr?.review_decision, "changes_requested");
  assert.equal(pr?.checks, "failure");
  assert.equal(pr?.author, null);
  assert.equal(pr?.head_ref, "fix");
  assert.equal(toItem({ __typename: "Discussion", number: 1 }), null);
  assert.equal(toItem(null), null);
});

test("toTimeline: コメント・レビュー（行のスレッドを結ぶ・空のコメントだけのレビューは出さない）・続けてのコミットは 1 つ・出来事は文", () => {
  const { threads, threadReview } = toThreads({
    nodes: [
      {
        id: "T1",
        path: "a.ts",
        line: 10,
        originalLine: 9,
        diffSide: "RIGHT",
        isResolved: true,
        isOutdated: false,
        comments: { nodes: [{ id: "C1", author: user("r"), createdAt: "t", bodyHTML: "<p>ここ</p>", diffHunk: "@@", url: "cu", pullRequestReview: { id: "R1" } }] },
      },
    ],
  });
  assert.equal(threads[0].resolved, true);
  assert.equal(threadReview.get("T1"), "R1");
  const timeline = toTimeline(
    [
      { __typename: "IssueComment", id: "I1", author: user("a"), createdAt: "1", bodyHTML: "<p>hi</p>", url: "x" },
      { __typename: "PullRequestCommit", id: "P1", commit: { oid: "aaa", messageHeadline: "one", committedDate: "2", author: { name: "N", user: null } } },
      { __typename: "PullRequestCommit", id: "P2", commit: { oid: "bbb", messageHeadline: "two", committedDate: "3", author: { name: "N", user: null } } },
      { __typename: "PullRequestReview", id: "R1", author: user("r"), createdAt: "4", state: "CHANGES_REQUESTED", bodyHTML: "" },
      { __typename: "PullRequestReview", id: "R2", author: user("r"), createdAt: "5", state: "COMMENTED", bodyHTML: "" },
      { __typename: "LabeledEvent", id: "E1", actor: user("a"), createdAt: "6", label: { name: "bug" } },
      { __typename: "MentionedEvent", id: "E2" },
    ],
    threads,
    threadReview,
  );
  assert.deepEqual(
    timeline.map((e) => e.type),
    ["comment", "commits", "review", "event"],
  );
  const commits = timeline[1];
  assert.ok(commits.type === "commits");
  assert.deepEqual(
    commits.commits.map((c) => c.oid),
    ["aaa", "bbb"],
  );
  assert.deepEqual(commits.author, { login: "N", avatar_url: null });
  const review = timeline[2];
  assert.ok(review.type === "review" && review.state === "changes_requested");
  assert.deepEqual(review.thread_ids, ["T1"]);
  assert.ok(timeline[3].type === "event" && timeline[3].text === "ラベル「bug」を付けました");
});

test("eventText: 閉じ方・マージ・レビュー依頼・知らない種類", () => {
  assert.equal(eventText({ __typename: "ClosedEvent", stateReason: "DUPLICATE" }), "重複として閉じました");
  assert.equal(eventText({ __typename: "ClosedEvent", stateReason: null }), "閉じました");
  assert.equal(eventText({ __typename: "MergedEvent", mergeRefName: "main", commit: { abbreviatedOid: "abc1234" } }), "abc1234 を main にマージしました");
  assert.equal(eventText({ __typename: "ReviewRequestedEvent", requestedReviewer: { name: "core" } }), "core にレビューを頼みました");
  assert.equal(eventText({ __typename: "DeployedEvent" }), null);
});

test("toCheck・checksStateOf・toPullFile", () => {
  assert.deepEqual(
    toCheck({ __typename: "CheckRun", name: "test", status: "IN_PROGRESS", conclusion: null, detailsUrl: "d", title: null, checkSuite: { workflowRun: { workflow: { name: "CI" } } } }),
    { name: "test", workflow: "CI", state: "pending", description: null, url: "d" },
  );
  assert.equal(toCheck({ __typename: "CheckRun", name: "lint", status: "COMPLETED", conclusion: "FAILURE" })?.state, "failure");
  assert.equal(toCheck({ __typename: "StatusContext", context: "ci/x", state: "ERROR", targetUrl: "t", description: "落ちた" })?.state, "failure");
  assert.equal(toCheck({ __typename: "Other" }), null);
  assert.equal(checksStateOf("EXPECTED"), "pending");
  assert.equal(checksStateOf(null), null);
  assert.deepEqual(toPullFile({ filename: "b.ts", previous_filename: "a.ts", status: "renamed", additions: 1, deletions: 2 }), {
    path: "b.ts",
    previous_path: "a.ts",
    status: "renamed",
    additions: 1,
    deletions: 2,
    patch: null,
  });
});

test("ghFailureMessage・parseIncludeOutput: よくある失敗の文と、gh api -i の状態・ETag・本文", () => {
  assert.equal(ghFailureMessage(new CommandError(Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" })), "o/r"), GH_MISSING);
  assert.equal(ghFailureMessage(new Error("gh: To get started with GitHub CLI, please run:  gh auth login"), "o/r"), GH_LOGGED_OUT);
  assert.match(ghFailureMessage(new Error("Could not resolve to a Repository with the name 'o/r'."), "o/r"), /「o\/r」が見つからないか/);
  assert.match(ghFailureMessage(new Error("gh: something odd\nmore"), null), /^GitHub に聞けませんでした: something odd$/);

  const notModified = parseIncludeOutput('HTTP/2.0 304 Not Modified\r\nEtag: W/"abc"\r\n\r\n');
  assert.deepEqual(notModified, { status: 304, etag: 'W/"abc"', body: null });
  const ok = parseIncludeOutput('HTTP/2.0 200 OK\nETag: "e2"\nX: y\n\n[{"number":1}]');
  assert.deepEqual(ok, { status: 200, etag: '"e2"', body: [{ number: 1 }] });
});
