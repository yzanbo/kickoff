// GitHub の答え → GitHub タブの API の形
import assert from "node:assert/strict";
import { test } from "node:test";
import { CommandError } from "../system/exec.js";
import { GH_LOGGED_OUT, GH_MISSING, ghApiHostArgs, ghFailureMessage, githubWriteError, parseIncludeOutput } from "./ghApi.js";
import { reviewPayload } from "./writes.js";
import { checksStateOf, eventText, toCheck, toItem, toMergeAbility, toMergeState, toPullFile, toThreads, toTimeline, toViewer } from "./normalize.js";

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
        viewerCanReply: true,
        viewerCanResolve: false,
        viewerCanUnresolve: true,
        comments: { nodes: [{ id: "C1", author: user("r"), createdAt: "t", bodyHTML: "<p>ここ</p>", diffHunk: "@@", url: "cu", pullRequestReview: { id: "R1" } }] },
      },
    ],
  });
  assert.equal(threads[0].resolved, true);
  // 解決済みのスレッドは「戻せるか」で決める
  assert.deepEqual([threads[0].can_reply, threads[0].can_resolve], [true, true]);
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
    toCheck({ __typename: "CheckRun", databaseId: 31, name: "test", status: "IN_PROGRESS", conclusion: null, detailsUrl: "d", title: null, checkSuite: { workflowRun: { databaseId: 7, workflow: { name: "CI" } } } }),
    { name: "test", workflow: "CI", state: "pending", description: null, url: "d", run_id: 7, job_id: 31, started_at: null, completed_at: null },
  );
  // 外の CI の check run（workflowRun がない）は、ログを開けないので ID を持たない
  assert.deepEqual(
    [toCheck({ __typename: "CheckRun", databaseId: 9, name: "circleci", status: "COMPLETED", conclusion: "SUCCESS", checkSuite: { workflowRun: null } })?.run_id, toCheck({ __typename: "StatusContext", context: "v", state: "SUCCESS" })?.job_id],
    [null, null],
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

test("githubWriteError: 断られた理由（message と errors）・401 はログインの案内・404 は書き込めない", () => {
  assert.equal(githubWriteError(401, null, "o/r"), GH_LOGGED_OUT);
  assert.equal(
    githubWriteError(405, { message: "At least 1 approving review is required by reviewers with write access." }, "o/r"),
    "GitHub に断られました（HTTP 405）: At least 1 approving review is required by reviewers with write access.",
  );
  assert.equal(
    githubWriteError(422, { message: "Unprocessable Entity", errors: ["Review Can not approve your own pull request", { code: "invalid" }] }, "o/r"),
    "GitHub に断られました（HTTP 422）: Unprocessable Entity / Review Can not approve your own pull request / invalid",
  );
  assert.match(githubWriteError(404, { message: "Not Found" }, "o/r"), /^「o\/r」で見つからないか、このアカウントには書き込む権限がありません$/);
  assert.equal(githubWriteError(500, "x", null), "GitHub に断られました（HTTP 500）");
});

test("toViewer・toMergeState・toMergeAbility: できること・マージの様子・許す方式と書き込みの権限", () => {
  assert.deepEqual(toViewer({ viewerCanClose: true, viewerCanReopen: false }), { can_close: true, can_reopen: false, can_label: false });
  assert.equal(toMergeState("BEHIND"), "behind");
  assert.equal(toMergeState("HAS_HOOKS"), "has_hooks");
  assert.equal(toMergeState("SOMETHING_NEW"), "unknown");
  assert.equal(toMergeState(null), "unknown");
  assert.deepEqual(toMergeAbility({ mergeCommitAllowed: false, squashMergeAllowed: true, rebaseMergeAllowed: true, viewerPermission: "WRITE" }), { merge_methods: ["squash", "rebase"], can_merge: true });
  assert.deepEqual(toMergeAbility({ mergeCommitAllowed: true, viewerPermission: "TRIAGE" }), { merge_methods: ["merge"], can_merge: false });
  assert.deepEqual(toMergeAbility(null), { merge_methods: [], can_merge: false });
});

test("reviewPayload: REST のレビューの本文（範囲の行・空の本文は省く・空のコメント / 変更依頼は断る）", () => {
  assert.deepEqual(
    reviewPayload({
      event: "request_changes",
      body: " 直して ",
      commit_id: "abc1234",
      comments: [
        { path: "a.ts", line: 5, side: "RIGHT", start_line: 3, body: "ここ" },
        { path: "b.ts", line: 2, side: "LEFT", start_line: 2, body: "1 行" },
      ],
    }),
    {
      event: "REQUEST_CHANGES",
      body: "直して",
      commit_id: "abc1234",
      comments: [
        { path: "a.ts", line: 5, side: "RIGHT", body: "ここ", start_line: 3, start_side: "RIGHT" },
        { path: "b.ts", line: 2, side: "LEFT", body: "1 行" },
      ],
    },
  );
  assert.deepEqual(reviewPayload({ event: "approve", body: "", commit_id: null, comments: [] }), { event: "APPROVE", comments: [] });
  assert.throws(() => reviewPayload({ event: "comment", body: "  ", commit_id: null, comments: [] }), /本文か行のコメント/);
  assert.throws(() => reviewPayload({ event: "request_changes", body: "", commit_id: null, comments: [] }), /直してほしいこと/);
});

test("ghApiHostArgs: github.com なら何も足さず、GitHub Enterprise なら --hostname", () => {
  assert.deepEqual(ghApiHostArgs("github.com"), []);
  assert.deepEqual(ghApiHostArgs("ghe.example.com"), ["--hostname", "ghe.example.com"]);
});
