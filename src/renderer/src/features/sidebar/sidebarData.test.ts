import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatGroup } from "@shared/types";
import { dropProject, removeGroup, upsertGroup } from "./sidebarData";

const group = (id: number, project_id: number, position: number) => ({ id, project_id, position }) as ChatGroup;

test("upsertGroup / removeGroup: グループは並び順（position → id）で並べ、削除は消す", () => {
  const prev = { 1: [group(1, 1, 0), group(2, 1, 1)] };
  const next = upsertGroup(prev, group(3, 1, 0));
  assert.deepEqual(next[1].map((g) => g.id), [1, 3, 2]);
  assert.deepEqual(upsertGroup(next, group(1, 1, 5))[1].map((g) => g.id), [3, 2, 1]);
  assert.deepEqual(removeGroup(next, 1, 3)[1].map((g) => g.id), [1, 2]);
});

test("dropProject: 削除されたプロジェクトの分だけを消す（なければそのまま）", () => {
  const prev = { 1: [group(10, 1, 0)], 2: [group(20, 2, 0)] };
  assert.deepEqual(dropProject(prev, 1), { 2: prev[2] });
  assert.equal(dropProject(prev, 9), prev);
});
