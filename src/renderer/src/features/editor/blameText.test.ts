import assert from "node:assert/strict";
import test from "node:test";
import type { GitBlame, GitBlameCommit } from "@shared/types";
import { blameAt, blameHover, blameLabel } from "./blameText";

const now = Date.parse("2026-11-10T12:00:00Z");
const commit = (over: Partial<GitBlameCommit> = {}): GitBlameCommit => ({
  hash: "abcdef1234567890",
  author: "山田",
  email: "yamada@example.com",
  date: new Date(now - 5 * 86400 * 1000).toISOString(),
  summary: "行を直す",
  uncommitted: false,
  you: false,
  ...over,
});

test("blameAt: 行のコミット。ファイルの終わりの空の行・行の数が合わないときは null", () => {
  const blame: GitBlame = { commits: [commit(), commit({ hash: "0000", uncommitted: true })], lines: [0, 1] };
  assert.equal(blameAt(blame, 1, 3)?.hash, "abcdef1234567890");
  assert.equal(blameAt(blame, 2, 2)?.uncommitted, true);
  assert.equal(blameAt(blame, 3, 3), null);
  assert.equal(blameAt(blame, 1, 5), null);
  assert.equal(blameAt(null, 1, 1), null);
});

test("blameLabel / blameHover: 誰, いつ • メッセージ。自分は「あなた」、まだコミットしていない行はその旨", () => {
  assert.equal(blameLabel(commit(), now), "山田, 5日前 • 行を直す");
  assert.equal(blameLabel(commit({ you: true }), now), "あなた, 5日前 • 行を直す");
  assert.equal(blameLabel(commit({ uncommitted: true }), now), "あなた, まだコミットしていない変更");
  assert.match(blameHover(commit({ summary: "a*b" }), now), /\*\*山田\*\*[\s\S]*a\\\*b[\s\S]*`abcdef12`/);
});
