import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorktreePrNotice } from "@shared/types";
import { reduceWorktreePrs } from "./worktreePrs";

const notice = (project_id: number, number: number): WorktreePrNotice => ({
  project_id,
  worktree: `/w/${project_id}-${number}`,
  branch: `b${number}`,
  pr: { number, title: "t", url: "u", state: "MERGED" },
  dismissed: false,
});

test("ワークツリーの PR の知らせ: そのプロジェクトの分を入れ替え、消したプロジェクトの分を外す。関係のない知らせでは同じ一覧", () => {
  const list = [notice(1, 2), notice(3, 4)];
  assert.deepEqual(reduceWorktreePrs(list, { type: "worktree_prs", project_id: 1, notices: [notice(1, 5)] }), [notice(3, 4), notice(1, 5)]);
  assert.deepEqual(reduceWorktreePrs(list, { type: "worktree_prs", project_id: 3, notices: [] }), [notice(1, 2)]);
  assert.deepEqual(reduceWorktreePrs(list, { type: "project_deleted", id: 1 }), [notice(3, 4)]);
  assert.equal(reduceWorktreePrs(list, { type: "project_deleted", id: 9 }), list);
  assert.equal(reduceWorktreePrs(list, { type: "settings_reloaded" } as never), list);
});
