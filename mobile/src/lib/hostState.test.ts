import assert from "node:assert/strict";
import { test } from "vitest";
import type { Approval } from "@shared/chat/approvalTypes";
import { makeChat } from "@shared/chat/testing";
import { makeProject } from "@shared/projects/testing";
import { applyHostEvent, chatSections, emptyHostState, newChatTarget } from "./hostState";

const approval = (id: string, chatId: number): Approval => ({ id, chat_id: chatId, project_id: 1, kind: "question", tool_name: "AskUserQuestion", input: {}, can_remember: false, created_at: "2026-11-14T00:00:00Z" });

test("applyHostEvent: チャット・プロジェクト・回答待ちを足す・直す・消す。関係のない知らせでは同じものを返す", () => {
  let s = applyHostEvent(emptyHostState, { type: "project", project: makeProject(1) });
  s = applyHostEvent(s, { type: "chat", chat: makeChat(1, { title: "a" }) });
  s = applyHostEvent(s, { type: "chat", chat: makeChat(1, { title: "b" }) });
  s = applyHostEvent(s, { type: "approval", approval: approval("q", 1) });
  assert.deepEqual([s.chats.map((c) => c.title), s.approvals.length], [["b"], 1]);
  assert.equal(applyHostEvent(s, { type: "notes", project_id: 1, path: null }), s);
  s = applyHostEvent(s, { type: "approval_resolved", id: "q", chat_id: 1 });
  s = applyHostEvent(s, { type: "chat_deleted", id: 1, project_id: 1 });
  assert.deepEqual([s.chats.length, s.approvals.length], [0, 0]);
});

test("chatSections: プロジェクトごとに、ボードと同じ急ぐ順（作業中 → 回答待ち → 未読 → 既読）→ 最後に動いた順。アーカイブ・子チャット・ノートのチャット・しまったプロジェクトは出さない", () => {
  const state = {
    projects: [makeProject(1), makeProject(2, { archived_at: "2026-01-01T00:00:00Z" })],
    chats: [
      makeChat(1, { active_at: "2026-11-14T03:00:00Z" }),
      makeChat(2, { status: "running", active_at: "2026-11-14T01:00:00Z" }),
      makeChat(3, { unread: true, active_at: "2026-11-14T00:00:00Z" }),
      makeChat(4, { active_at: "2026-11-14T02:00:00Z" }),
      makeChat(5, { archived_at: "2026-11-14T00:00:00Z" }),
      makeChat(6, { parent_chat_id: 1 }),
      makeChat(7, { note_path: "a.md" }),
      makeChat(8, { project_id: 2 }),
    ],
    approvals: [approval("q", 4)],
  };
  const sections = chatSections(state);
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].rows.map((r) => [r.chat.id, r.state]), [
    [2, "running"],
    [4, "needs_input"],
    [3, "unread"],
    [1, "read"],
  ]);
});

test("chatSections: 共通の節がいつも先頭（チャットがなくても出す）。そのあとパソコンのサイドバーと同じ並び（固定 → 並べ替えた順）", () => {
  const common = makeProject(9, { name: "共通", kind: "common", position: 0 });
  const state = {
    projects: [makeProject(1, { position: 1 }), makeProject(2, { position: 2, pinned: true }), common],
    chats: [makeChat(1, { project_id: 1 })],
    approvals: [],
  };
  const sections = chatSections(state);
  assert.deepEqual(
    sections.map((s) => [s.project.id, s.rows.length]),
    [
      [9, 0],
      [2, 0],
      [1, 1],
    ],
  );
  // 共通のチャットは共通の節に入る
  const withCommonChat = chatSections({ ...state, chats: [makeChat(5, { project_id: 9 })] });
  assert.deepEqual(withCommonChat[0].rows.map((r) => r.chat.id), [5]);
});

test("newChatTarget: いちばん上の「新しいチャット」は共通に作る。共通がなければ並びの先頭のプロジェクト、どれもなければ null", () => {
  const common = makeProject(9, { kind: "common" });
  assert.equal(newChatTarget([makeProject(1, { pinned: true }), common]), 9);
  assert.equal(newChatTarget([makeProject(1, { position: 2 }), makeProject(2, { position: 1 })]), 2);
  assert.equal(newChatTarget([makeProject(1, { archived_at: "2026-01-01T00:00:00Z" })]), null);
});
