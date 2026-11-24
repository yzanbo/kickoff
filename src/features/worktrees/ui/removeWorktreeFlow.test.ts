import assert from "node:assert/strict";
import { test } from "vitest";
import type { WorktreeRemovalInfo } from "@shared/git/types";
import { removalNotes } from "./removeWorktreeFlow";

const info = (patch: Partial<WorktreeRemovalInfo> = {}): WorktreeRemovalInfo => ({ branch: "x", changes: 0, unpushed: 0, only_here: 0, pushed: true, has_remote: true, db_connections: [], ...patch });

test("消すときの注意: 変更・プッシュしていないコミット・このブランチにしかないコミットの 3 つ（失うものがなければ空）", () => {
  assert.deepEqual(removalNotes(info({ changes: 2, unpushed: 1, only_here: 3 }), { deleteBranch: true }), [
    "コミットしていない変更が 2 ファイルあります。ワークツリーを消すとなくなります。",
    "GitHub にプッシュしていないコミットが 1 件あります。",
    "このブランチにしかないコミットが 3 件あります。ブランチも消すと、これらのコミットもなくなります。",
  ]);
  assert.deepEqual(removalNotes(info(), { deleteBranch: "ask" }), []);
});

test("消すときの注意: ブランチを残すならこのブランチにしかないコミットは出さず、リモートがなければプッシュの注意は出さない", () => {
  assert.deepEqual(removalNotes(info({ only_here: 3 }), { deleteBranch: false }), []);
  assert.deepEqual(removalNotes(info({ unpushed: 1, pushed: false, has_remote: false }), { deleteBranch: "ask" }), []);
});

test("消すときの注意: ブランチも消すかをこれから選ぶ確認だけ、まだプッシュしていないブランチを知らせる", () => {
  const unpublished = info({ pushed: false });
  assert.deepEqual(removalNotes(unpublished, { deleteBranch: "ask" }), ["このブランチは、まだ GitHub にプッシュしていません。"]);
  assert.deepEqual(removalNotes(unpublished, { deleteBranch: true }), []);
  assert.deepEqual(removalNotes(info({ pushed: false, branch: null }), { deleteBranch: "ask" }), []);
});
