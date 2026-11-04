import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectSummary } from "@shared/types";
import { archivedProjects, sidebarOrder } from "./projectOrder";

const project = (id: number, patch: Partial<ProjectSummary> = {}): ProjectSummary =>
  ({ id, name: `p${id}`, pinned: false, position: id, archived_at: null, created_at: `2026-01-0${id}T00:00:00Z`, ...patch }) as ProjectSummary;

test("sidebarOrder: 固定したものが先、そのあと並べ替えた順（同じなら ID）。しまったものは出さない", () => {
  const projects = [project(1, { position: 2 }), project(2, { position: 1 }), project(3, { pinned: true, position: 9 }), project(4, { archived_at: "2026-02-01T00:00:00Z" }), project(5, { position: 1 })];
  assert.deepEqual(
    sidebarOrder(projects).map((p) => p.id),
    [3, 2, 5, 1],
  );
});

test("sidebarOrder: lastActive を渡すと、固定したものの次は最近動いた順（固定の中でも最近動いた順）", () => {
  const projects = [project(1, { pinned: true }), project(2), project(3, { pinned: true }), project(4)];
  const lastActive = (p: ProjectSummary) => ({ 1: "2026-03-01", 2: "2026-03-05", 3: "2026-03-02", 4: "2026-03-04" })[p.id] ?? "";
  assert.deepEqual(
    sidebarOrder(projects, lastActive).map((p) => p.id),
    [3, 1, 2, 4],
  );
});

test("archivedProjects: しまったものだけを名前順に", () => {
  const projects = [project(1, { name: "b", archived_at: "x" }), project(2, { name: "a" }), project(3, { name: "a", archived_at: "x" })];
  assert.deepEqual(
    archivedProjects(projects).map((p) => p.id),
    [3, 1],
  );
});
