import assert from "node:assert/strict";
import { test } from "vitest";
import type { Project } from "./types";
import { makeProject } from "./testing";
import { chatTargetChoices, sidebarOrder } from "./order";

const project = (id: number, patch: Partial<Project> = {}) => makeProject(id, { name: `p${id}`, created_at: `2026-01-0${id}T00:00:00Z`, ...patch });
const common = project(9, { name: "共通", kind: "common" });

test("sidebarOrder: 固定したものが先、そのあと並べ替えた順（同じなら ID）。しまったものは出さない", () => {
  const projects = [project(1, { position: 2 }), project(2, { position: 1 }), project(3, { pinned: true, position: 9 }), project(4, { archived_at: "2026-02-01T00:00:00Z" }), project(5, { position: 1 })];
  assert.deepEqual(
    sidebarOrder(projects).map((p) => p.id),
    [3, 2, 5, 1],
  );
});

test("sidebarOrder: lastActive を渡すと、固定したものの次は最近動いた順（固定の中でも最近動いた順）", () => {
  const projects = [project(1, { pinned: true }), project(2), project(3, { pinned: true }), project(4)];
  const lastActive = (p: Project) => ({ 1: "2026-03-01", 2: "2026-03-05", 3: "2026-03-02", 4: "2026-03-04" })[p.id] ?? "";
  assert.deepEqual(
    sidebarOrder(projects, lastActive).map((p) => p.id),
    [3, 1, 2, 4],
  );
});

test("sidebarOrder: 共通はいつも先頭（固定したものより前・固定や並べ替えた順に左右されない）。しまった共通は出さない", () => {
  const projects = [project(1, { pinned: true, position: 1 }), project(2, { kind: "common", position: 0 }), project(3, { pinned: true, position: 2 }), project(4, { position: 0 })];
  assert.deepEqual(
    sidebarOrder(projects).map((p) => p.id),
    [2, 1, 3, 4],
  );
  assert.deepEqual(
    sidebarOrder([project(1), project(2, { kind: "common", archived_at: "x" })]).map((p) => p.id),
    [1],
  );
});

test("chatTargetChoices: 共通が先頭、あとはアーカイブしていない利用者のプロジェクト（サイドバーの並び）。いまの作成先がアーカイブ済みならいちばん下に足す", () => {
  const projects = [project(1, { position: 2 }), project(2, { position: 1, pinned: true }), project(3, { archived_at: "x" }), common];
  const choices = chatTargetChoices(projects, 1);
  assert.deepEqual(choices.values, ["9", "2", "1"]);
  assert.equal(choices.labels["9"], "共通");
  assert.deepEqual(chatTargetChoices(projects, 3).values, ["9", "2", "1", "3"]);
});
