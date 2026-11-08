import assert from "node:assert/strict";
import { test } from "node:test";
import type { Chat } from "@shared/types";
import { makeChat } from "@shared/testing/factories";
import { byActive } from "@/stores/chats";
import { chatComparator, DEFAULT_CHAT_SORT, nextChatSort, parseChatSort, type ChatSortContext } from "./chatSort";

const chat = (id: number, extra: Partial<Chat> = {}) => makeChat(id, { active_at: `2026-01-0${id}`, ...extra });
const ids = (list: Chat[]) => list.map((c) => c.id);
const ctx: ChatSortContext = {
  projectName: (id) => ["", "B", "A"][id] ?? "",
  groupName: (c) => (c.group_id === null ? undefined : `g${c.group_id}`),
  stateOf: (c) => (c.status === "running" ? "running" : c.unread ? "unread" : "read"),
};
const sorted = (list: Chat[], key: Parameters<typeof nextChatSort>[1], dir: "asc" | "desc") => ids([...list].sort(chatComparator({ key, dir }, ctx)));

test("chatComparator: 初めの並びは最後に動いた順（byActive そのもの）", () => {
  assert.equal(chatComparator(DEFAULT_CHAT_SORT, ctx), byActive);
});

test("chatComparator: 名前は日本語・数を含めて自然な順、同じ値は最後に動いた順", () => {
  const list = [chat(1, { title: "タスク10" }), chat(2, { title: "タスク2" }), chat(3, { title: "タスク2" })];
  assert.deepEqual(sorted(list, "title", "asc"), [3, 2, 1]);
  assert.deepEqual(sorted(list, "title", "desc"), [1, 3, 2]);
});

test("chatComparator: 値のないもの（グループなし・コンテキスト不明）は向きによらずいちばん後ろ", () => {
  const list = [chat(1, { group_id: null }), chat(2, { group_id: 2 }), chat(3, { group_id: 1 })];
  assert.deepEqual(sorted(list, "group", "asc"), [3, 2, 1]);
  assert.deepEqual(sorted(list, "group", "desc"), [2, 3, 1]);
  const ctxList = [chat(1), chat(2, { context_tokens: 50, context_window: 100 }), chat(3, { context_tokens: 10, context_window: 100 })];
  assert.deepEqual(sorted(ctxList, "context", "desc"), [2, 3, 1]);
  assert.deepEqual(sorted(ctxList, "context", "asc"), [3, 2, 1]);
});

test("chatComparator: プロジェクト名・状態（カンバンの列の順）・数", () => {
  const list = [chat(1, { project_id: 1, cost_usd: 2 }), chat(2, { project_id: 2, status: "running", cost_usd: 1 }), chat(3, { project_id: 1, unread: true, cost_usd: 3 })];
  assert.deepEqual(sorted(list, "project", "asc"), [2, 3, 1]);
  assert.deepEqual(sorted(list, "state", "asc"), [2, 3, 1]);
  assert.deepEqual(sorted(list, "cost", "desc"), [3, 1, 2]);
});

test("nextChatSort: 同じ列は向きを逆に、別の列は文字なら昇順・数と日時なら降順から", () => {
  assert.deepEqual(nextChatSort(DEFAULT_CHAT_SORT, "active"), { key: "active", dir: "asc" });
  assert.deepEqual(nextChatSort(DEFAULT_CHAT_SORT, "title"), { key: "title", dir: "asc" });
  assert.deepEqual(nextChatSort({ key: "title", dir: "asc" }, "cost"), { key: "cost", dir: "desc" });
});

test("parseChatSort: 合わない値は捨てる", () => {
  assert.deepEqual(parseChatSort({ key: "cost", dir: "asc" }), { key: "cost", dir: "asc" });
  assert.equal(parseChatSort({ key: "nope", dir: "asc" }), undefined);
  assert.equal(parseChatSort({ key: "cost", dir: "up" }), undefined);
  assert.equal(parseChatSort(null), undefined);
});
