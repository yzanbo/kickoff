import assert from "node:assert/strict";
import { test } from "node:test";
import { makePullDetail, makeReviewThread } from "@shared/testing/factories";
import { captureNameOf, handOffText, itemDocument, linkOf, quotePrompt, reviewDocument, reviewFixText, sourceOf, worktreeBranchOf } from "./githubPrompt";

const user = { login: "alice", avatar_url: null };

test("結び付き: URL の持ち主/名前と番号・種類", () => {
  assert.deepEqual(linkOf(makePullDetail()), { repo: "o/r", number: 5, kind: "pr" });
});

test("issue・PR の札の中身: 題名と URL・本文・コメントとレビューの本文（空のレビューは除く）・解決していない行のコメント", () => {
  const detail = makePullDetail({
    timeline: [
      { type: "comment", id: "a", author: user, created_at: "2026-11-02T10:00:00Z", body_html: "", body_markdown: "再現しました\n手順は…", url: null },
      { type: "review", id: "b", author: user, created_at: "2026-11-03T00:00:00Z", state: "commented", body_html: "", body_markdown: "  ", thread_ids: [] },
      { type: "event", id: "c", actor: user, created_at: "2026-11-03T00:00:00Z", text: "ラベルを付けた" },
    ],
    review_threads: [makeReviewThread(1, { path: "src/b.ts", line: 9 }), makeReviewThread(2, { resolved: true })],
  });
  const text = itemDocument(detail);
  assert.match(text, /^# GitHub の PR #5「直す」（https:\/\/github\.com\/o\/r\/pull\/5）\n/);
  assert.match(text, /## 本文\n\n本文/);
  assert.match(text, /### @alice（2026-11-02）\n\n再現しました\n手順は…/);
  assert.doesNotMatch(text, /のレビュー/);
  assert.doesNotMatch(text, /ラベルを付けた/);
  assert.match(text, /## 解決していない行のコメント\n\n### src\/b\.ts:9\n- （不明）: コメント/);
  assert.equal(text.match(/### src\/a\.ts/), null);
});

test("issue の札の中身: 本文が空なら（本文なし）・コメントがなければ見出しも出さない・途中までなら添える", () => {
  const issue = makePullDetail({ body_markdown: "", timeline_truncated: true });
  issue.item = { ...issue.item, kind: "issue", url: "https://github.com/o/r/issues/5" };
  const text = itemDocument({ item: issue.item, body_html: "", body_markdown: "", timeline: [], timeline_truncated: true, linked_pulls: [], viewer: issue.viewer, fetched_at: issue.fetched_at });
  assert.match(text, /issue #5/);
  assert.match(text, /（本文なし）/);
  assert.doesNotMatch(text, /## コメント/);
  assert.match(text, /途中までです/);
});

test("レビューコメントの札の中身: 解決していないスレッドのファイル・行（消した側・古い差分の印）・コメント（複数行は字下げ）", () => {
  const detail = makePullDetail({
    review_threads: [
      makeReviewThread(1, { line: null, original_line: 4, side: "LEFT", outdated: true }),
      makeReviewThread(2, { resolved: true }),
      makeReviewThread(3, { comments: [{ id: "x", author: user, created_at: "t", body_html: "", body_markdown: "1 行目\n2 行目", diff_hunk: "", url: null }] }),
    ],
  });
  const text = reviewDocument(detail);
  assert.match(text, /^# GitHub の PR #5「直す」（https:\/\/github\.com\/o\/r\/pull\/5）のレビューコメント\n/);
  assert.match(text, /### src\/a\.ts:4（消した側の行）（古い差分へのコメント）/);
  assert.match(text, /- @alice: 1 行目\n  2 行目/);
  assert.equal(text.match(/### /g)?.length, 2);
  assert.match(reviewDocument(detail, [detail.review_threads[2]]), /## 行のコメント\n\n### src\/a\.ts:1\n- @alice/);
  assert.equal(reviewDocument(detail, [detail.review_threads[2]]).match(/### /g)?.length, 1);
});

test("一言と出どころ: 入力欄の一言・札の出どころ（番号付きのラベル・レビューは別の種類）・札のファイル名", () => {
  const detail = makePullDetail();
  assert.equal(handOffText(detail), "GitHub の PR #5「直す」に対応してください。");
  assert.match(reviewFixText(detail), /^GitHub の PR #5「直す」のレビューコメントに対応して、コードを直してください。直したらコミットしてください。$/);
  assert.deepEqual(sourceOf(detail), { type: "github_pull", label: "o/r#5 直す", url: "https://github.com/o/r/pull/5" });
  assert.deepEqual(sourceOf(detail, true), { type: "github_review", label: "o/r#5 直す のレビューコメント", url: "https://github.com/o/r/pull/5" });
  assert.equal(captureNameOf(detail), "pr-5.md");
  assert.equal(captureNameOf(detail, true), "pr-5-review.md");
  const issue = { ...detail, item: { ...detail.item, kind: "issue" as const, url: "https://github.com/o/r/issues/5" } };
  assert.equal(sourceOf(issue).type, "github_issue");
  assert.equal(captureNameOf(issue), "issue-5.md");
});

test("選んだ文の引用: どの issue・PR の文かを頭に、選んだ文を Markdown の引用に", () => {
  assert.equal(quotePrompt(makePullDetail(), "1 行目\n\n2 行目 "), "GitHub の PR #5「直す」（https://github.com/o/r/pull/5）より:\n> 1 行目\n>\n> 2 行目");
});

test("ワークツリーの名前の案: issue は番号と題名の英数字の語、PR は番号だけ", () => {
  const issue = (title: string) => makePullDetail({ item: { ...makePullDetail().item, kind: "issue", number: 128, title } });
  assert.equal(worktreeBranchOf(issue("Login screen crashes on empty email")), "issue-128-login-screen-crashes-on-empty");
  assert.equal(worktreeBranchOf(issue("ログイン画面で落ちる（iOS 18）")), "issue-128-ios-18");
  assert.equal(worktreeBranchOf(issue("ログイン画面で落ちる")), "issue-128");
  assert.equal(worktreeBranchOf(issue("Internationalization localization configuration")), "issue-128-internationalization");
  assert.equal(worktreeBranchOf(makePullDetail()), "pr-5");
});
