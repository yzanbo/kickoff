import assert from "node:assert/strict";
import { test } from "node:test";
import { makePullDetail, makeReviewThread } from "@shared/testing/factories";
import { itemPrompt, linkOf, quotePrompt, reviewFixPrompt, threadPrompt } from "./githubPrompt";

const user = { login: "alice", avatar_url: null };

test("結び付き: URL の持ち主/名前と番号・種類", () => {
  assert.deepEqual(linkOf(makePullDetail()), { repo: "o/r", number: 5, kind: "pr" });
});

test("issue・PR を渡す文: 題名と URL・本文・コメントとレビューの本文（空のレビューは除く）・解決していない行のコメント", () => {
  const detail = makePullDetail({
    timeline: [
      { type: "comment", id: "a", author: user, created_at: "2026-11-02T10:00:00Z", body_html: "", body_markdown: "再現しました\n手順は…", url: null },
      { type: "review", id: "b", author: user, created_at: "2026-11-03T00:00:00Z", state: "commented", body_html: "", body_markdown: "  ", thread_ids: [] },
      { type: "event", id: "c", actor: user, created_at: "2026-11-03T00:00:00Z", text: "ラベルを付けた" },
    ],
    review_threads: [makeReviewThread(1, { path: "src/b.ts", line: 9 }), makeReviewThread(2, { resolved: true })],
  });
  const text = itemPrompt(detail);
  assert.match(text, /^GitHub の PR #5「直す」（https:\/\/github\.com\/o\/r\/pull\/5）について対応してください。/);
  assert.match(text, /## 本文\n\n本文/);
  assert.match(text, /### @alice（2026-11-02）\n\n再現しました\n手順は…/);
  assert.doesNotMatch(text, /のレビュー/);
  assert.doesNotMatch(text, /ラベルを付けた/);
  assert.match(text, /## 解決していない行のコメント\n\n### src\/b\.ts:9\n- （不明）: コメント/);
  assert.equal(text.match(/### src\/a\.ts/), null);
});

test("issue を渡す文: 本文が空なら（本文なし）・コメントがなければ見出しも出さない・途中までなら添える", () => {
  const issue = makePullDetail({ body_markdown: "", timeline_truncated: true });
  issue.item = { ...issue.item, kind: "issue", url: "https://github.com/o/r/issues/5" };
  const text = itemPrompt({ item: issue.item, body_html: "", body_markdown: "", timeline: [], timeline_truncated: true, viewer: issue.viewer, fetched_at: issue.fetched_at });
  assert.match(text, /issue #5/);
  assert.match(text, /（本文なし）/);
  assert.doesNotMatch(text, /## コメント/);
  assert.match(text, /途中までです/);
});

test("レビューコメントで直す文: 解決していないスレッドのファイル・行（消した側・古い差分の印）・コメント（複数行は字下げ）", () => {
  const detail = makePullDetail({
    review_threads: [
      makeReviewThread(1, { line: null, original_line: 4, side: "LEFT", outdated: true }),
      makeReviewThread(2, { resolved: true }),
      makeReviewThread(3, { comments: [{ id: "x", author: user, created_at: "t", body_html: "", body_markdown: "1 行目\n2 行目", diff_hunk: "", url: null }] }),
    ],
  });
  const text = reviewFixPrompt(detail);
  assert.match(text, /直したらコミットしてください。/);
  assert.match(text, /### src\/a\.ts:4（消した側の行）（古い差分へのコメント）/);
  assert.match(text, /- @alice: 1 行目\n  2 行目/);
  assert.equal(text.match(/### /g)?.length, 2);
  assert.match(threadPrompt(detail, detail.review_threads[2]), /次のレビューコメントに対応してください。\n\n### src\/a\.ts:1\n- @alice/);
});

test("選んだ文の引用: どの issue・PR の文かを頭に、選んだ文を Markdown の引用に", () => {
  assert.equal(quotePrompt(makePullDetail(), "1 行目\n\n2 行目 "), "GitHub の PR #5「直す」（https://github.com/o/r/pull/5）より:\n> 1 行目\n>\n> 2 行目");
});
