import assert from "node:assert/strict";
import { test } from "node:test";
import { makeChat, makeProject } from "@shared/testing/factories";
import { dockBadgeCount } from "./dockBadge";

test("dockBadgeCount: アーカイブしていないプロジェクトの回答待ち・未読のチャットを数え、作業中・既読・アーカイブ済みは数えない", () => {
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
  assert.equal(dockBadgeCount(chats, projects, new Set([1])), 3);
  assert.equal(dockBadgeCount([], projects, new Set()), 0);
});
