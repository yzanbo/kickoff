// API のテスト: GitHub タブ（連携の状態・一覧と ETag での取り直し・issue / PR の中身・PR の変更。GitHub の答えは testServer の ghFake）
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { GitHubConnection, GitHubIssueDetail, GitHubItemPage, GitHubPullDetail, GitHubPullFiles, GitHubPullWorktree } from "@shared/types";
import { Invalid } from "./errors.js";
import { setup, TOKEN } from "../testing/testServer.js";
import { gitRepo } from "../testing/gitRepo.js";
import { tempDir } from "../testing/tempDir.js";

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
  assert.deepEqual((await call("GET", `${base}/connection`)).body, { host: "github.com", repo: "o/r", account: "me", reason: null } satisfies GitHubConnection);

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

  // 担当・マイルストーンはいくつも（「どれか」。マイルストーンの名前は , を含みうるので改行で区切る）
  ghFake.calls.length = 0;
  await call("GET", `${base}/items?kind=issue&state=all&assignees=a,b&milestones=${encodeURIComponent("v1, 春\nv2")}`);
  assert.equal(ghFake.calls.find((c) => c.kind === "graphql")?.vars?.q, 'repo:o/r is:issue (assignee:a OR assignee:b) (milestone:"v1, 春" OR milestone:v2) sort:updated-desc');

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
    headRefOid: "abc123",
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
  assert.equal(detail.head_sha, "abc123");
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

  // 最後に取った中身は GitHub に聞かずに返す（開き直したときのつなぎ。まだ取っていなければ null）
  ghFake.calls.length = 0;
  const cached = await call("GET", `${base}/pulls/5?cached=1`);
  assert.equal(cached.status, 200);
  assert.equal((cached.body as GitHubPullDetail).head_sha, "abc123");
  assert.equal((await call("GET", `${base}/pulls/8?cached=1`)).body, null);
  assert.equal((await call("GET", `${base}/issues/5?cached=1`)).body, null);
  assert.equal(ghFake.calls.filter((c) => c.kind === "graphql").length, 0);

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

test("GitHub タブ: PR のブランチのワークツリー（PR の元のブランチを聞いて作り、2 回目はあるものを返す。Git でないフォルダは 400）", async () => {
  const { call, project, ghFake } = setup();
  const url = `/api/projects/${project.id}/github/pulls/4/worktree`;
  assert.equal((await call("POST", url)).status, 400);

  // 連携先の代わりの bare のリポジトリ（ブランチ fix）を clone したものをプロジェクトフォルダにする
  const src = gitRepo({ files: { "a.txt": "a\n" } });
  src.git("branch", "fix");
  const bare = path.join(tempDir(), "o-r.git");
  execFileSync("git", ["clone", "-q", "--bare", src.dir, bare]);
  execFileSync("git", ["clone", "-q", bare, project.repo_path]);
  ghFake.remotes = [{ name: "origin", host: "github.com", repo: "o/r", url: bare }];
  ghFake.rest = (p) => ({ status: 200, etag: null, body: p.startsWith("repos/o/r/pulls/") ? { head: { ref: "fix", repo: { full_name: "o/r" } } } : null });

  const made = await call("POST", url);
  assert.equal(made.status, 200);
  const result = made.body as GitHubPullWorktree;
  assert.equal(result.branch, "fix");
  assert.ok(result.worktree_path && fs.existsSync(path.join(result.worktree_path, "a.txt")));
  assert.deepEqual((await call("POST", url)).body, result);

  // 連携先の remote がない
  ghFake.remotes = [{ name: "origin", host: "github.com", repo: "x/y", url: bare }];
  assert.equal((await call("POST", `/api/projects/${project.id}/github/pulls/5/worktree`)).status, 400);
});

test("GitHub タブの書き込み: コメント・閉じる / 開き直す・ラベル・issue の作成を REST で送る（空の本文・題名は 400）", async () => {
  const { call, project, ghFake } = setup();
  const base = `/api/projects/${project.id}/github`;
  ghFake.send = (method, path) => (path.endsWith("/labels") ? [{ name: "bug", color: "d73a4a" }] : method === "POST" && path === "repos/o/r/issues" ? { number: 42, html_url: "https://github.com/o/r/issues/42" } : {});
  const sent = () => ghFake.calls.filter((c) => c.kind === "send").map((c) => [c.method, c.detail, c.body]);

  assert.equal((await call("POST", `${base}/items/7/comments`, { body: "見ました" })).status, 204);
  assert.equal((await call("POST", `${base}/items/7/comments`, { body: "  " })).status, 400);
  assert.equal((await call("POST", `${base}/issues/7/state`, { state: "closed", reason: "not_planned" })).status, 204);
  assert.equal((await call("POST", `${base}/issues/7/state`, { state: "open" })).status, 204);
  assert.equal((await call("POST", `${base}/pulls/8/state`, { state: "closed" })).status, 204);
  assert.equal((await call("POST", `${base}/issues/7/state`, { state: "merged" })).status, 400);
  const labels = await call("PUT", `${base}/items/7/labels`, { labels: ["bug"] });
  assert.deepEqual(labels.body, [{ name: "bug", color: "d73a4a" }]);
  const created = await call("POST", `${base}/issues`, { title: "落ちる", body: "手順", labels: ["bug"], assignees: ["me"] });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { number: 42, url: "https://github.com/o/r/issues/42" });
  assert.equal((await call("POST", `${base}/issues`, { title: " " })).status, 400);

  assert.deepEqual(sent(), [
    ["POST", "repos/o/r/issues/7/comments", { body: "見ました" }],
    ["PATCH", "repos/o/r/issues/7", { state: "closed", state_reason: "not_planned" }],
    ["PATCH", "repos/o/r/issues/7", { state: "open", state_reason: "reopened" }],
    ["PATCH", "repos/o/r/pulls/8", { state: "closed" }],
    ["PUT", "repos/o/r/issues/7/labels", { labels: ["bug"] }],
    ["POST", "repos/o/r/issues", { title: "落ちる", body: "手順", labels: ["bug"], assignees: ["me"] }],
  ]);
});

test("GitHub タブの書き込み: レビューの送信・スレッドへの返信と解決・マージ（GitHub が断ったら理由の文で 400）", async () => {
  const { call, project, ghFake } = setup();
  const base = `/api/projects/${project.id}/github`;
  const review = { event: "comment", body: "", commit_id: "abc1234", comments: [{ path: "a.ts", line: 3, side: "RIGHT", body: "ここ" }] };
  assert.equal((await call("POST", `${base}/pulls/5/reviews`, review)).status, 204);
  assert.deepEqual(ghFake.calls.at(-1)?.body, { event: "COMMENT", commit_id: "abc1234", comments: [{ path: "a.ts", line: 3, side: "RIGHT", body: "ここ" }] });
  assert.equal((await call("POST", `${base}/pulls/5/reviews`, { event: "comment", body: "", comments: [] })).status, 400);
  assert.equal((await call("POST", `${base}/pulls/5/reviews`, { event: "lgtm" })).status, 400);

  ghFake.graphql = () => ({});
  assert.equal((await call("POST", `${base}/pulls/5/threads/PRRT_kw1/replies`, { body: "直しました" })).status, 204);
  assert.deepEqual(ghFake.calls.at(-1)?.vars, { thread: "PRRT_kw1", body: "直しました" });
  assert.equal((await call("POST", `${base}/pulls/5/threads/PRRT_kw1/resolve`, { resolved: true })).status, 204);
  assert.match(ghFake.calls.at(-1)?.detail ?? "", /resolveReviewThread/);
  assert.equal((await call("POST", `${base}/pulls/5/threads/PRRT_kw1/resolve`, { resolved: false })).status, 204);
  assert.match(ghFake.calls.at(-1)?.detail ?? "", /unresolveReviewThread/);
  assert.equal((await call("POST", `${base}/pulls/5/threads/a%20b/resolve`, { resolved: true })).status, 400);

  ghFake.send = () => ({ merged: true, sha: "def5678" });
  const merged = await call("POST", `${base}/pulls/5/merge`, { method: "squash", sha: "abc1234" });
  assert.deepEqual(merged.body, { sha: "def5678" });
  assert.deepEqual(ghFake.calls.at(-1)?.body, { merge_method: "squash", sha: "abc1234" });
  assert.equal(ghFake.calls.at(-1)?.method, "PUT");
  assert.equal((await call("POST", `${base}/pulls/5/merge`, { method: "fast" })).status, 400);

  ghFake.send = () => {
    throw new Invalid("GitHub に断られました（HTTP 405）: At least 1 approving review is required by reviewers with write access.");
  };
  const refused = await call("POST", `${base}/pulls/5/merge`, { method: "merge", sha: null });
  assert.equal(refused.status, 400);
  assert.match((refused.body as { error: string }).error, /approving review is required/);
});

test("GitHub タブ: 中身に自分にできること、PR にマージの様子・許す方式・マージできるかを返す", async () => {
  const { call, project, ghFake } = setup();
  ghFake.graphql = () => ({
    repository: {
      mergeCommitAllowed: false,
      squashMergeAllowed: true,
      rebaseMergeAllowed: false,
      viewerPermission: "WRITE",
      issueOrPullRequest: {
        __typename: "PullRequest",
        number: 5,
        title: "t",
        state: "OPEN",
        labels: { nodes: [] },
        assignees: { nodes: [] },
        comments: { totalCount: 0 },
        viewerCanClose: true,
        viewerCanLabel: true,
        mergeStateStatus: "BEHIND",
        timelineItems: { pageInfo: { hasNextPage: false }, nodes: [] },
        latestOpinionatedReviews: { nodes: [{ state: "APPROVED" }, { state: "CHANGES_REQUESTED" }, { state: "APPROVED" }] },
        statusCommits: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  contexts: {
                    nodes: [
                      { __typename: "CheckRun", name: "test", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-11-13T00:00:00Z", completedAt: "2026-11-13T00:03:20Z" },
                      { __typename: "StatusContext", context: "ext", state: "PENDING" },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    },
  });
  const detail = (await call("GET", `/api/projects/${project.id}/github/pulls/5`)).body as GitHubPullDetail;
  assert.deepEqual(detail.viewer, { can_close: true, can_reopen: false, can_label: true });
  assert.equal(detail.merge_state, "behind");
  assert.deepEqual(detail.merge_methods, ["squash"]);
  assert.equal(detail.can_merge, true);
  // 承認の数（人ごとのいちばん新しいレビュー）・チェックの時刻（外の CI の状態は null）・PR に結び付いた PR はない
  assert.equal(detail.approvals, 2);
  assert.deepEqual(
    detail.checks.map((c) => [c.name, c.started_at, c.completed_at]),
    [
      ["test", "2026-11-13T00:00:00Z", "2026-11-13T00:03:20Z"],
      ["ext", null, null],
    ],
  );
  assert.deepEqual(detail.linked_pulls, []);

  // issue を閉じる PR
  ghFake.graphql = () => ({
    repository: {
      issueOrPullRequest: {
        __typename: "Issue",
        number: 7,
        title: "t",
        state: "OPEN",
        labels: { nodes: [] },
        assignees: { nodes: [] },
        comments: { totalCount: 0 },
        timelineItems: { pageInfo: { hasNextPage: false }, nodes: [] },
        closedByPullRequestsReferences: { nodes: [{ number: 9, title: "直す", state: "MERGED", isDraft: false }, null] },
      },
    },
  });
  const issue = (await call("GET", `/api/projects/${project.id}/github/issues/7`)).body as GitHubIssueDetail;
  assert.deepEqual(issue.linked_pulls, [{ number: 9, title: "直す", state: "merged", is_draft: false }]);
});

test("GitHub タブ: PR のチェックアウト（本体なら本体のブランチを切り替える。ワークツリーは今までどおり）", async () => {
  const { call, project, ghFake } = setup();
  const src = gitRepo({ files: { "a.txt": "a\n" } });
  src.git("branch", "fix");
  const bare = path.join(tempDir(), "o-r.git");
  execFileSync("git", ["clone", "-q", "--bare", src.dir, bare]);
  execFileSync("git", ["clone", "-q", bare, project.repo_path]);
  ghFake.remotes = [{ name: "origin", host: "github.com", repo: "o/r", url: bare }];
  ghFake.rest = (p) => ({ status: 200, etag: null, body: p.startsWith("repos/o/r/pulls/") ? { head: { ref: "fix", repo: { full_name: "o/r" } } } : null });

  const res = await call("POST", `/api/projects/${project.id}/github/pulls/4/checkout`, { place: "main" });
  assert.deepEqual(res.body, { worktree_path: null, branch: "fix" } satisfies GitHubPullWorktree);
  assert.equal(execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: project.repo_path, encoding: "utf8" }).trim(), "fix");
  assert.equal((await call("POST", `/api/projects/${project.id}/github/pulls/4/checkout`, { place: "elsewhere" })).status, 400);
});

test("GitHub タブ: 本文の画像のうち連携先のリポジトリのファイルは、gh api で取って返す（1MB を超えれば blob・ほかのリポジトリ・画像でないものは 400）", async () => {
  const { app, call, project, ghFake } = setup();
  const base = `/api/projects/${project.id}/github/image?url=`;
  const get = (url: string) => app.request(base + encodeURIComponent(url), { headers: { authorization: `Bearer ${TOKEN}` } });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  ghFake.rest = (path) => {
    if (path === "repos/o/r/contents/docs/a%20b.png?ref=main") return { status: 200, etag: null, body: { type: "file", size: 7, sha: "s1", encoding: "base64", content: png.toString("base64") } };
    if (path === "repos/o/r/contents/big.png?ref=refs%2Fheads%2Ffeat") return { status: 200, etag: null, body: { type: "file", size: 2_000_000, sha: "s2", encoding: "none", content: "" } };
    if (path === "repos/o/r/git/blobs/s2") return { status: 200, etag: null, body: { content: png.toString("base64"), encoding: "base64" } };
    if (path === "repos/o/r/contents/huge.png?ref=main") return { status: 200, etag: null, body: { type: "file", size: 20_000_000, sha: "s3" } };
    throw new Error(`知らない ${path}`);
  };
  const res = await get("https://github.com/o/r/raw/main/docs/a%20b.png");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/png");
  assert.equal(res.headers.get("content-security-policy"), "sandbox");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), png);

  const big = await get("https://raw.githubusercontent.com/O/R/refs/heads/feat/big.png");
  assert.equal(big.status, 200);
  assert.deepEqual(Buffer.from(await big.arrayBuffer()), png);

  assert.equal((await call("GET", base + encodeURIComponent("https://github.com/o/r/raw/main/huge.png"))).status, 400);
  assert.equal((await call("GET", base + encodeURIComponent("https://github.com/x/other/raw/main/a.png"))).status, 400);
  assert.equal((await call("GET", base + encodeURIComponent("https://github.com/o/r/raw/main/a.txt"))).status, 400);
  assert.equal((await call("GET", base + encodeURIComponent("https://private-user-images.githubusercontent.com/1/a.png"))).status, 400);
});
