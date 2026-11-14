import assert from "node:assert/strict";
import { test } from "node:test";
import type { Approval } from "@shared/types";
import { makeChat, makeProject } from "@shared/testing/factories";
import { applyHostEvent, chatSections, emptyHostState } from "./hostState";

const approval = (id: string, chatId: number): Approval => ({ id, chat_id: chatId, project_id: 1, kind: "question", tool_name: "AskUserQuestion", input: {}, can_remember: false, created_at: "2026-11-14T00:00:00Z" });

test("applyHostEvent: チャット・プロジェクト・回答待ちを足す・直す・消す。関係のない知らせでは同じものを返す", () => {
  let s = applyHostEvent(emptyHostState, { type: "project", project: makeProject(1) });
  s = applyHostEvent(s, { type: "chat", chat: makeChat(1, { title: "a" }) });
  s = applyHostEvent(s, { type: "chat", chat: makeChat(1, { title: "b" }) });
  s = applyHostEvent(s, { type: "approval", approval: approval("q", 1) });
  assert.deepEqual([s.chats.map((c) => c.title), s.approvals.length], [["b"], 1]);
  assert.equal(applyHostEvent(s, { type: "memos", project_id: 1, path: null }), s);
  s = applyHostEvent(s, { type: "approval_resolved", id: "q", chat_id: 1 });
  s = applyHostEvent(s, { type: "chat_deleted", id: 1, project_id: 1 });
  assert.deepEqual([s.chats.length, s.approvals.length], [0, 0]);
});

test("chatSections: プロジェクトごとに、回答待ち → 作業中 → 未読 → 最後に動いた順。アーカイブ・子チャット・メモのチャット・しまったプロジェクトは出さない", () => {
  const state = {
    projects: [makeProject(1), makeProject(2, { archived_at: "2026-01-01T00:00:00Z" })],
    chats: [
      makeChat(1, { active_at: "2026-11-14T03:00:00Z" }),
      makeChat(2, { status: "running", active_at: "2026-11-14T01:00:00Z" }),
      makeChat(3, { unread: true, active_at: "2026-11-14T00:00:00Z" }),
      makeChat(4, { active_at: "2026-11-14T02:00:00Z" }),
      makeChat(5, { archived_at: "2026-11-14T00:00:00Z" }),
      makeChat(6, { parent_chat_id: 1 }),
      makeChat(7, { memo_path: "a.md" }),
      makeChat(8, { project_id: 2 }),
    ],
    approvals: [approval("q", 4)],
  };
  const sections = chatSections(state);
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].rows.map((r) => [r.chat.id, r.state]), [
    [4, "needs_input"],
    [2, "running"],
    [3, "unread"],
    [1, "read"],
  ]);
});
