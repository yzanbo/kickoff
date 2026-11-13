import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorktreePrNotice, WorktreeRemovalInfo } from "@shared/types";
import { defaultWorktreeAction, prNoticeMarkLabel, prNoticeTitle, prNoticeWarnings, rootChatIds } from "./prNoticePlan";

const notice = (state: "MERGED" | "CLOSED"): WorktreePrNotice => ({
  project_id: 1,
  worktree: "/w/x",
  branch: "x",
  pr: { number: 12, title: "t", url: "u", state },
  dismissed: false,
});
const info = (patch: Partial<WorktreeRemovalInfo> = {}): WorktreeRemovalInfo => ({ branch: "x", changes: 0, unpushed: 0, only_here: 0, pushed: true, has_remote: true, db_connections: [], ...patch });

test("PR の知らせ: 見出し・印・ワークツリーの扱いの初めの値（マージ = ブランチも消す / 閉じた = ワークツリーだけ）", () => {
  assert.equal(prNoticeTitle(notice("MERGED")), "PR #12 がマージされました");
  assert.equal(prNoticeTitle(notice("CLOSED")), "PR #12 がマージされずに閉じられました");
  assert.equal(prNoticeMarkLabel(notice("CLOSED")), "閉じた");
  assert.equal(defaultWorktreeAction(notice("MERGED")), "both");
  assert.equal(defaultWorktreeAction(notice("CLOSED")), "worktree");
});

test("PR の知らせ: アーカイブ・削除するのは、親が一緒に入っていないチャットだけ", () => {
  assert.deepEqual(
    rootChatIds([
      { id: 1, parent_chat_id: null },
      { id: 2, parent_chat_id: 1 },
      { id: 3, parent_chat_id: 99 },
    ]),
    [1, 3],
  );
});

test("PR の知らせ: 注意は消すものに合わせて出す（残すならワークツリーの中身の注意は出さない）", () => {
  const all = info({ changes: 2, unpushed: 1, only_here: 3 });
  assert.deepEqual(prNoticeWarnings(all, 0, "both", "archive"), [
    "コミットしていない変更が 2 ファイルあります。ワークツリーを消すとなくなります。",
    "GitHub にプッシュしていないコミットが 1 件あります。",
    "このブランチにしかないコミットが 3 件あります。ブランチも消すと元に戻せません。",
  ]);
  assert.equal(prNoticeWarnings(all, 0, "worktree", "archive").length, 2);
  assert.deepEqual(prNoticeWarnings(all, 0, "keep", "keep"), []);
  assert.deepEqual(prNoticeWarnings(info(), 1, "keep", "archive"), ["作業中のチャットが 1 件あります。終わってから片付けてください。"]);
  assert.deepEqual(prNoticeWarnings(undefined, 0, "keep", "delete"), ["チャットを削除すると、元に戻せません。"]);
});
