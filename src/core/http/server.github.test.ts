// API のテスト: GitHub タブ（連携の状態・一覧と ETag での取り直し・issue / PR の中身・PR の変更。GitHub の答えは testServer の ghFake）
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubConnection, GitHubIssueDetail, GitHubItemPage, GitHubPullDetail, GitHubPullFiles } from "@shared/types";
import { setup, TOKEN } from "../testing/testServer.js";

const searchAnswer = (numbers: number[]) => ({
  search: {
    issueCount: numbers.length,
    pageInfo: { hasNextPage: true, endCursor: "CUR" },
    nodes: numbers.map((n) => ({ __typename: "Issue", number: n, title: `#${n}`, state: "OPEN", url: `u${n}`, labels: { nodes: [] }, assignees: { nodes: [] }, comments: { totalCount: 0 } })),
  },
});

test("GitHub タブ: 連携の状態（remote がない・聞けない・使える）", async () => {
  const { call, project, ghFake } = setup();
  const base = `/api/projects/${project.id}/github`;
  ghFake.graphql = () => ({ viewer: { login: "me" } });
  assert.deepEqual((await call("GET", `${base}/connection`)).body, { repo: "o/r", account: "me", reason: null } satisfies GitHubConnection);

  ghFake.graphql = () => {
    throw new Error("gh: To get started with GitHub CLI, please run:  gh auth login");
  };
  const failed = (await call("GET", `${base}/connection`)).body as GitHubConnection;
  assert.equal(failed.repo, "o/r");
  assert.match(failed.reason ?? "", /gh auth login|聞けませんでした/);

  ghFake.target = null;
  const none = (await call("GET", `${base}/connection`)).body as GitHubConnection;
  assert.equal(none.repo, null);
  assert.match(none.reason ?? "", /GitHub の remote がありません/);
  assert.equal((await call("GET", `${base}/items?kind=issue`)).status, 400);
});

test("GitHub タブ: 一覧は絞り込みを検索の文にして聞き、変わっていなければ（304）覚えたものを返す。refresh・続きは聞き直す", async () => {
  const { call, project, ghFake } = setup();
  const base = `/api/projects/${project.id}/github`;
  ghFake.graphql = () => searchAnswer([1, 2]);
  let etag = '"e1"';
  ghFake.rest = (_path, sent) => (sent === etag ? { status: 304, etag, body: null } : { status: 200, etag, body: [] });

  const first = await call("GET", `${base}/items?kind=issue&mine=assigned&labels=bug,ui&q=crash&sort=created`);
  assert.equal(first.status, 200);
  const page = first.body as GitHubItemPage;
  assert.deepEqual(
    page.items.map((i) => i.number),
    [1, 2],
  );
  assert.equal(page.cursor, "CUR");
  const search = ghFake.calls.find((c) => c.kind === "graphql");
  assert.equal(search?.vars?.q, "repo:o/r is:issue is:open assignee:@me label:bug label:ui sort:created-desc crash");

  // 同じ絞り込み: ETag で聞いて 304 なら GraphQL は聞かない
  ghFake.calls.length = 0;
  ghFake.graphql = () => searchAnswer([9]);
  const again = (await call("GET", `${base}/items?kind=issue&mine=assigned&labels=bug,ui&q=crash&sort=created`)).body as GitHubItemPage;
  assert.deepEqual(
    again.items.map((i) => i.number),
    [1, 2],
  );
  assert.deepEqual(
    ghFake.calls.map((c) => [c.kind, c.etag ?? null]),
    [["rest", '"e1"']],
  );

  // 変わった（ETag が違う）なら聞き直す
  etag = '"e2"';
  const changed = (await call("GET", `${base}/items?kind=issue&mine=assigned&labels=bug,ui&q=crash&sort=created`)).body as GitHubItemPage;
  assert.deepEqual(
    changed.items.map((i) => i.number),
    [9],
  );

  // refresh は ETag を聞かずに聞き直し、続き（cursor）は after を付けて聞く
  ghFake.calls.length = 0;
  await call("GET", `${base}/items?kind=issue&mine=assigned&labels=bug,ui&q=crash&sort=created&refresh=1`);
  assert.equal(ghFake.calls.filter((c) => c.kind === "rest" && c.etag).length, 0);
  ghFake.calls.length = 0;
  await call("GET", `${base}/items?kind=pr&cursor=CUR`);
  assert.deepEqual(
    ghFake.calls.map((c) => [c.kind, c.vars?.after]),
    [["graphql", "CUR"]],
  );

  // 知らない値は 400
  assert.equal((await call("GET", `${base}/items?kind=discussion`)).status, 400);
  assert.equal((await call("GET", `${base}/items?kind=issue&state=weird`)).status, 400);
});

test("GitHub タブ: issue と PR の中身（種類が違えば 404）・PR の行のスレッドとチェック・変更したファイル", async () => {
  const { call, project, ghFake } = setup();
  const base = `/api/projects/${project.id}/github`;
  const pr = {
    __typename: "PullRequest",
    number: 5,
    title: "直す",
    state: "OPEN",
    url: "u",
    labels: { nodes: [] },
    assignees: { nodes: [] },
    comments: { totalCount: 1 },
    bodyHTML: "<p>本文</p>",
    additions: 3,
    deletions: 1,
    changedFiles: 2,
    mergeable: "CONFLICTING",
    headRepositoryOwner: { login: "fork" },
    timelineItems: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [{ __typename: "PullRequestReview", id: "R1", author: { login: "r" }, createdAt: "t", state: "APPROVED", bodyHTML: "<p>OK</p>" }],
    },
    reviewThreads: { nodes: [{ id: "T1", path: "a.ts", line: 3, originalLine: 3, diffSide: "RIGHT", isResolved: false, isOutdated: false, comments: { nodes: [{ id: "C1", bodyHTML: "x", diffHunk: "@@", pullRequestReview: { id: "R1" } }] } }] },
    statusCommits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "SUCCESS" }] } } } }] },
  };
  ghFake.graphql = (_q, vars) => ({ repository: { issueOrPullRequest: vars.number === 5 ? pr : null } });

  const detail = (await call("GET", `${base}/pulls/5`)).body as GitHubPullDetail;
  assert.equal(detail.item.kind, "pr");
  assert.equal(detail.body_html, "<p>本文</p>");
  assert.equal(detail.mergeable, "conflicting");
  assert.equal(detail.head_owner, "fork");
  assert.deepEqual(
    detail.review_threads.map((t) => t.id),
    ["T1"],
  );
  assert.ok(detail.timeline[0].type === "review" && detail.timeline[0].thread_ids[0] === "T1");
  assert.deepEqual(
    detail.checks.map((c) => [c.name, c.state]),
    [["test", "success"]],
  );
  assert.equal(detail.timeline_truncated, false);

  assert.equal((await call("GET", `${base}/issues/5`)).status, 404);
  assert.equal((await call("GET", `${base}/pulls/6`)).status, 404);
  assert.equal((await call("GET", `${base}/pulls/abc`)).status, 400);

  // issue は出来事の続きを読む（2 回目からは timeline だけ）
  let asked = 0;
  ghFake.graphql = () => {
    asked++;
    const nodes = [{ __typename: "IssueComment", id: `I${asked}`, bodyHTML: "c", createdAt: "t" }];
    const pageInfo = { hasNextPage: asked < 5, endCursor: `c${asked}` };
    return {
      repository: {
        issueOrPullRequest: { __typename: "Issue", number: 7, title: "t", state: "OPEN", labels: { nodes: [] }, assignees: { nodes: [] }, comments: { totalCount: 0 }, timelineItems: { pageInfo, nodes } },
      },
    };
  };
  const issue = (await call("GET", `${base}/issues/7`)).body as GitHubIssueDetail;
  assert.equal(asked, 3);
  assert.equal(issue.timeline.length, 3);
  assert.equal(issue.timeline_truncated, true);

  ghFake.pages = (path) => ({ items: [{ filename: "a.ts", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n-a\n+b" }], truncated: false, path });
  const files = (await call("GET", `${base}/pulls/5/files`)).body as GitHubPullFiles;
  assert.deepEqual(
    files.files.map((f) => f.path),
    ["a.ts"],
  );
  assert.equal(ghFake.calls.at(-1)?.detail, "repos/o/r/pulls/5/files");
});

test("GitHub タブ: この Mac からの頼みだけ受ける", async () => {
  const { app, project } = setup();
  const res = await app.request(`/api/projects/${project.id}/github/connection`, { headers: { authorization: `Bearer ${TOKEN}` } }, { incoming: { socket: { remoteAddress: "192.168.1.5" } } });
  assert.equal(res.status, 403);
});
