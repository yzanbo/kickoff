import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run } from "../../../../core/types";
import { kanbanEntries } from "./useKanbanEntries";

const run = (id: number, extra: Partial<Run> = {}) =>
  ({ id, project_id: 1, phase: "implementation", worktree_path: "", archived_at: null, updated_at: `2026-01-0${id}`, title: `c${id}`, ...extra }) as Run;
const all = { archive: "all" as const, section: "all" as const, worktree: "all", matches: () => true };
const stateOf = () => "done" as const;
const ids = (list: { run: Run }[]) => list.map((e) => e.run.id);

test("kanbanEntries: 新しく動いた順に並べ、状態を付ける", () => {
  const list = kanbanEntries([run(1), run(3), run(2)], all, () => "running");
  assert.deepEqual(ids(list), [3, 2, 1]);
  assert.equal(list[0].state, "running");
});

test("kanbanEntries: アーカイブ済みだけ・作業場所・セクション・名前で絞る", () => {
  const runs = [run(1, { archived_at: "x" }), run(2, { worktree_path: "/wt" }), run(3, { phase: "requirements" }), run(4)];
  assert.deepEqual(ids(kanbanEntries(runs, { ...all, archive: "archived" }, stateOf)), [1]);
  assert.deepEqual(ids(kanbanEntries(runs, { ...all, worktree: "/wt" }, stateOf)), [2]);
  assert.deepEqual(ids(kanbanEntries(runs, { ...all, worktree: "" }, stateOf)), [4, 3, 1]);
  assert.deepEqual(ids(kanbanEntries(runs, { ...all, section: "requirements" }, stateOf)), [3]);
  assert.deepEqual(ids(kanbanEntries(runs, { ...all, matches: (r) => r.title === "c4" }, stateOf)), [4]);
});

test("kanbanEntries: 全プロジェクトのボードでは、出すプロジェクト以外のチャットを除く", () => {
  const runs = [run(1, { project_id: 1 }), run(2, { project_id: 2 })];
  assert.deepEqual(ids(kanbanEntries(runs, all, stateOf, new Set([2]))), [2]);
  assert.deepEqual(ids(kanbanEntries(runs, all, stateOf)), [2, 1]);
});
