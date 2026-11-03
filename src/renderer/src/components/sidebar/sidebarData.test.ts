import assert from "node:assert/strict";
import { test } from "node:test";
import type { Run, RunGroup } from "../../../../core/types";
import { dropProject, removeGroup, removeRun, upsertGroup, upsertRun } from "./sidebarData";

const run = (id: number, project_id: number, active_at: string) => ({ id, project_id, active_at }) as Run;
const group = (id: number, project_id: number, position: number) => ({ id, project_id, position }) as RunGroup;

test("upsertRun: 届いたチャットをそのプロジェクトに入れ、新しく動いた順に並べる（同じ ID は置き換え）", () => {
  const prev = { 1: [run(10, 1, "2026-01-02"), run(11, 1, "2026-01-01")], 2: [run(20, 2, "2026-01-01")] };
  const next = upsertRun(prev, run(11, 1, "2026-01-03"));
  assert.deepEqual(next[1].map((r) => r.id), [11, 10]);
  assert.equal(next[2], prev[2]);
  // まだ読み込んでいないプロジェクトにも入る
  assert.deepEqual(upsertRun({}, run(30, 3, "2026-01-01"))[3].map((r) => r.id), [30]);
});

test("removeRun: 削除されたチャットだけを消す（ほかのプロジェクトは触らない）", () => {
  const prev = { 1: [run(10, 1, "a"), run(11, 1, "b")], 2: [run(20, 2, "c")] };
  const next = removeRun(prev, 1, 10);
  assert.deepEqual(next[1].map((r) => r.id), [11]);
  assert.equal(next[2], prev[2]);
  assert.deepEqual(removeRun({}, 9, 1), { 9: [] });
});

test("upsertGroup / removeGroup: グループは並び順（position → id）で並べ、削除は消す", () => {
  const prev = { 1: [group(1, 1, 0), group(2, 1, 1)] };
  const next = upsertGroup(prev, group(3, 1, 0));
  assert.deepEqual(next[1].map((g) => g.id), [1, 3, 2]);
  assert.deepEqual(upsertGroup(next, group(1, 1, 5))[1].map((g) => g.id), [3, 2, 1]);
  assert.deepEqual(removeGroup(next, 1, 3)[1].map((g) => g.id), [1, 2]);
});

test("dropProject: 削除されたプロジェクトの分だけを消す（なければそのまま）", () => {
  const prev = { 1: [run(10, 1, "a")], 2: [run(20, 2, "b")] };
  assert.deepEqual(dropProject(prev, 1), { 2: prev[2] });
  assert.equal(dropProject(prev, 9), prev);
});
