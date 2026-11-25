import assert from "node:assert/strict";
import { test } from "vitest";
import type { Project } from "@shared/projects/types";
import { makeProject } from "@shared/projects/testing";
import { chatTargetChoices, fallbackTargetOf, firstTargetOf } from "./projectTargets";
import { indexProjects } from "./stores/projects";

const project = (id: number, patch: Partial<Project> = {}) => makeProject(id, { name: `p${id}`, ...patch });
const common = project(9, { name: "共通", kind: "common" });

test("firstTargetOf: 利用者のプロジェクト（アーカイブしていない）の先頭。1 つもなければ共通", () => {
  assert.equal(firstTargetOf([common, project(1, { archived_at: "x" }), project(2), project(3)]), 2);
  assert.equal(firstTargetOf([common, project(1, { archived_at: "x" })]), 9);
  assert.equal(firstTargetOf([]), undefined);
});

test("fallbackTargetOf: 最後に選んだもの（共通も）→ もうない・覚えがなければサイドバーの並びの利用者のプロジェクトの先頭 → 共通", () => {
  const projects = [common, project(1, { position: 2 }), project(2, { position: 1 })];
  const index = indexProjects(projects);
  assert.equal(fallbackTargetOf(1, index), 1);
  assert.equal(fallbackTargetOf(9, index), 9);
  // 覚えがない・もうないなら、サイドバーの並び（position の順）の先頭の利用者のプロジェクト。先頭にいる共通ではない
  assert.equal(fallbackTargetOf(undefined, index), 2);
  assert.equal(fallbackTargetOf(5, index), 2);
  // 利用者のプロジェクトが 1 つもなければ共通
  assert.equal(fallbackTargetOf(undefined, indexProjects([common])), 9);
  // 一覧が届く前は、覚えたものをそのまま
  assert.equal(fallbackTargetOf(5, indexProjects([], false)), 5);
});

test("chatTargetChoices: 共通が先頭、あとはアーカイブしていない利用者のプロジェクト（サイドバーの並び）。いまの作成先がアーカイブ済みならいちばん下に足す", () => {
  const projects = [project(1, { position: 2 }), project(2, { position: 1, pinned: true }), project(3, { archived_at: "x" }), common];
  const choices = chatTargetChoices(projects, 1);
  assert.deepEqual(choices.values, ["9", "2", "1"]);
  assert.equal(choices.labels["9"], "共通");
  assert.deepEqual(chatTargetChoices(projects, 3).values, ["9", "2", "1", "3"]);
});
