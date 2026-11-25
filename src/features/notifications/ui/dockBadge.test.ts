import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import { makeProject } from "@shared/projects/testing";
import { dockBadgeCounts } from "./dockBadge";

test("dockBadgeCounts: アーカイブしていないプロジェクトのチャットを作業中・回答待ち・未読に分けて数え、既読・アーカイブ済みは数えない", () => {
  const projects = [makeProject(1), makeProject(2, { archived_at: "2026-11-01T00:00:00.000Z" })];
  const chats = [
    makeChat(1, { project_id: 1, status: "running" }), // 回答待ち（依頼がある）
    makeChat(2, { project_id: 1, status: "completed", unread: true }), // 未読
    makeChat(3, { project_id: 1, status: "failed", unread: true }), // 見ていない失敗も未読
    makeChat(4, { project_id: 1, status: "running" }), // 作業中
    makeChat(5, { project_id: 1, status: "completed", unread: false }), // 既読
    makeChat(6, { project_id: 1, status: "completed", unread: true, archived_at: "2026-11-01T00:00:00.000Z" }), // アーカイブ済み
    makeChat(7, { project_id: 2, status: "completed", unread: true }), // しまったプロジェクト
  ];
  assert.deepEqual(dockBadgeCounts(chats, projects, new Set([1])), { running: 1, needs_input: 1, unread: 2 });
  assert.deepEqual(dockBadgeCounts([], projects, new Set()), { running: 0, needs_input: 0, unread: 0 });
});

test("dockBadgeCounts: 見えないプロジェクト（共通のノート）のチャットは数えない", () => {
  const projects = [makeProject(1), makeProject(2, { kind: "common" })];
  const chats = [makeChat(1, { project_id: 1, status: "completed", unread: true }), makeChat(2, { project_id: 2, status: "completed", unread: true })];
  assert.deepEqual(dockBadgeCounts(chats, projects, new Set()), { running: 0, needs_input: 0, unread: 1 });
});
