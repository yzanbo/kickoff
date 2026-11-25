import assert from "node:assert/strict";
import { test } from "vitest";
import type { Project } from "@shared/projects/types";
import { makeProject } from "@shared/projects/testing";
import { archivedProjects, recentOrder, reorderableIds, sidebarOrder } from "./projectOrder";

const project = (id: number, patch: Partial<Project> = {}) => makeProject(id, { name: `p${id}`, created_at: `2026-01-0${id}T00:00:00Z`, ...patch });

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
  const chat = (projectId: number, active_at: string, archived = false) => ({ project_id: projectId, active_at, archived_at: archived ? "x" : null });
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

test("recentOrder: 最近動いた順でも共通が先頭（共通のチャットが古くても）", () => {
  const projects = [project(1), project(2, { kind: "common" }), project(3, { pinned: true })];
  const chats = [{ project_id: 1, active_at: "2026-03-09", archived_at: null }, { project_id: 2, active_at: "2026-01-01", archived_at: null }];
  assert.deepEqual(
    recentOrder(projects, chats).map((p) => p.id),
    [2, 3, 1],
  );
});

test("reorderableIds: 並べ替え（保存する並び）に共通を入れない", () => {
  const projects = sidebarOrder([project(1), project(2, { kind: "common" }), project(3, { pinned: true })]);
  assert.deepEqual(reorderableIds(projects), [3, 1]);
});

test("archivedProjects: しまえるのは利用者のプロジェクトだけ（共通は入れない）", () => {
  const projects = [project(1), project(2, { kind: "common", archived_at: "x" }), project(3, { archived_at: "x" })];
  assert.deepEqual(
    archivedProjects(projects).map((p) => p.id),
    [3],
  );
});
