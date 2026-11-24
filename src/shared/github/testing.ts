// GitHub のテストのデータ（テストからだけ使う）
import type { GitHubPullDetail, GitHubReviewThread } from "@shared/github/types";
import { TEST_TIME } from "@shared/foundation/testing/data";

/** PR の行のスレッド（ID は「t<id>」、src/a.ts の新しい側の 1 行目・解決していない・コメント 1 つ） */
export function makeReviewThread(id: number, patch: Partial<GitHubReviewThread> = {}): GitHubReviewThread {
  return {
    id: `t${id}`,
    path: "src/a.ts",
    line: 1,
    original_line: 1,
    side: "RIGHT",
    resolved: false,
    outdated: false,
    can_reply: true,
    can_resolve: true,
    comments: [{ id: `c${id}`, author: null, created_at: TEST_TIME, body_html: "<p>コメント</p>", body_markdown: "コメント", diff_hunk: "@@ -1 +1 @@", url: null }],
    ...patch,
  };
}

/** PR の中身（o/r の #5「直す」・本文「本文」・会話もスレッドもなし。issue にするなら item.kind を issue に） */
export function makePullDetail(patch: Partial<GitHubPullDetail> = {}): GitHubPullDetail {
  return {
    item: {
      kind: "pr",
      number: 5,
      title: "直す",
      state: "open",
      state_reason: null,
      url: "https://github.com/o/r/pull/5",
      author: { login: "me", avatar_url: null },
      labels: [],
      assignees: [],
      milestone: null,
      comments: 0,
      created_at: TEST_TIME,
      updated_at: TEST_TIME,
      closed_at: null,
      is_draft: false,
      review_decision: null,
      checks: null,
      head_ref: "fix",
      base_ref: "main",
    },
    body_html: "<p>本文</p>",
    body_markdown: "本文",
    timeline: [],
    timeline_truncated: false,
    linked_pulls: [],
    viewer: { can_close: true, can_reopen: true, can_label: true },
    fetched_at: TEST_TIME,
    additions: 1,
    deletions: 0,
    changed_files: 1,
    head_sha: "abc",
    head_owner: "o",
    mergeable: "mergeable",
    merge_state: "clean",
    merge_methods: ["merge", "squash", "rebase"],
    can_merge: true,
    approvals: 0,
    review_threads: [],
    checks: [],
    ...patch,
  };
}
