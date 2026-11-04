import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { kanbanChats } from "./useKanbanChats";

const chat = (id: number, extra: Partial<Chat> = {}) => makeChat(id, { active_at: `2026-01-0${id}`, title: `c${id}`, ...extra });
const all = { archive: "all" as const, worktree: "all", matches: () => true };
const ids = (list: Chat[]) => list.map((c) => c.id);

test("kanbanChats: アーカイブ済みだけ・作業場所・名前で絞る（並びは渡したまま）", () => {
  const chats = [chat(1, { archived_at: "x" }), chat(2, { worktree_path: "/wt" }), chat(3), chat(4)];
  assert.deepEqual(ids(kanbanChats(chats, all)), [1, 2, 3, 4]);
  assert.deepEqual(ids(kanbanChats(chats, { ...all, archive: "archived" })), [1]);
  assert.deepEqual(ids(kanbanChats(chats, { ...all, archive: "active" })), [2, 3, 4]);
  assert.deepEqual(ids(kanbanChats(chats, { ...all, worktree: "/wt" })), [2]);
  assert.deepEqual(ids(kanbanChats(chats, { ...all, worktree: "" })), [1, 3, 4]);
  assert.deepEqual(ids(kanbanChats(chats, { ...all, matches: (r) => r.title === "c4" })), [4]);
});

test("kanbanChats: 全プロジェクトのボードでは、出すプロジェクト以外のチャットを除く", () => {
  const chats = [chat(1, { project_id: 1 }), chat(2, { project_id: 2 })];
  assert.deepEqual(ids(kanbanChats(chats, all, new Set([2]))), [2]);
  assert.deepEqual(ids(kanbanChats(chats, all)), [1, 2]);
});
