import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { kanbanEntries } from "./useKanbanEntries";

const chat = (id: number, extra: Partial<Chat> = {}) =>
  ({ id, project_id: 1, worktree_path: null, archived_at: null, active_at: `2026-01-0${id}`, title: `c${id}`, ...extra }) as Chat;
const all = { archive: "all" as const, worktree: "all", matches: () => true };
const stateOf = () => "read" as const;
const ids = (list: { chat: Chat }[]) => list.map((e) => e.chat.id);

test("kanbanEntries: 新しく動いた順に並べ、状態を付ける", () => {
  const list = kanbanEntries([chat(1), chat(3), chat(2)], all, () => "running");
  assert.deepEqual(ids(list), [3, 2, 1]);
  assert.equal(list[0].state, "running");
});

test("kanbanEntries: アーカイブ済みだけ・作業場所・名前で絞る", () => {
  const chats = [chat(1, { archived_at: "x" }), chat(2, { worktree_path: "/wt" }), chat(3), chat(4)];
  assert.deepEqual(ids(kanbanEntries(chats, { ...all, archive: "archived" }, stateOf)), [1]);
  assert.deepEqual(ids(kanbanEntries(chats, { ...all, worktree: "/wt" }, stateOf)), [2]);
  assert.deepEqual(ids(kanbanEntries(chats, { ...all, worktree: "" }, stateOf)), [4, 3, 1]);
  assert.deepEqual(ids(kanbanEntries(chats, { ...all, matches: (r) => r.title === "c4" }, stateOf)), [4]);
});

test("kanbanEntries: 全プロジェクトのボードでは、出すプロジェクト以外のチャットを除く", () => {
  const chats = [chat(1, { project_id: 1 }), chat(2, { project_id: 2 })];
  assert.deepEqual(ids(kanbanEntries(chats, all, stateOf, new Set([2]))), [2]);
  assert.deepEqual(ids(kanbanEntries(chats, all, stateOf)), [2, 1]);
});
