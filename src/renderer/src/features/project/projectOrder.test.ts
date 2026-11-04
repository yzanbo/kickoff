import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat, Project } from "@shared/types";
import { archivedProjects, recentOrder, sidebarOrder } from "./projectOrder";

const project = (id: number, patch: Partial<Project> = {}): Project =>
  ({ id, name: `p${id}`, pinned: false, position: id, archived_at: null, created_at: `2026-01-0${id}T00:00:00Z`, ...patch }) as Project;

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

test("recentOrder: 固定したものが先、そのあとチャット（アーカイブしたものを除く）が最後に動いた順。チャットがなければ作った時刻", () => {
  const projects = [project(1), project(2), project(3, { pinned: true }), project(4)];
  const chat = (projectId: number, active_at: string, archived = false) => ({ project_id: projectId, active_at, archived_at: archived ? "x" : null }) as Chat;
  // 店の一覧と同じく、最後に動いた順に並べて渡す
  const chats = [chat(2, "2026-03-09", true), chat(1, "2026-03-05"), chat(3, "2026-03-01"), chat(2, "2026-01-01")];
  assert.deepEqual(
    recentOrder(projects, chats).map((p) => p.id),
    [3, 1, 4, 2],
  );
});

test("archivedProjects: しまったものだけを名前順に", () => {
  const projects = [project(1, { name: "b", archived_at: "x" }), project(2, { name: "a" }), project(3, { name: "a", archived_at: "x" })];
  assert.deepEqual(
    archivedProjects(projects).map((p) => p.id),
    [3, 1],
  );
});
