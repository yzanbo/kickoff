import assert from "node:assert/strict";
import { test } from "vitest";
import { makeChat } from "@shared/chat/testing";
import { makeProject } from "@shared/projects/testing";
import { approvalIndex } from "@/features/chat/ui";
import { ACTIVE_STATES, activeChatGroups, type ActiveChatsInput, type ActiveDraft } from "./activeChatGroups";

const alpha = makeProject(1, { name: "alpha" });
const beta = makeProject(2, { name: "beta" });
const draft = (key: string, projectId: number, text = ""): ActiveDraft => ({ key, projectId, text, panel: `kanban:${projectId}` });
const chats = [
  makeChat(1, { project_id: 1, title: "作業中のもの", status: "running" }),
  makeChat(2, { project_id: 1, title: "未読のもの", status: "completed", unread: true }),
  makeChat(3, { project_id: 2, title: "回答待ち", status: "running" }),
  makeChat(4, { project_id: 2, title: "既読", status: "completed" }),
  makeChat(5, { project_id: 1, title: "しまった", status: "running", archived_at: "2026-01-01T00:00:00Z" }),
];
const base: ActiveChatsInput<ActiveDraft> = {
  chats,
  drafts: [draft("new:1", 1, "書きかけ"), draft("new:2", 2)],
  query: "",
  projects: [alpha, beta],
  projectName: (id) => (id === 1 ? "alpha" : "beta"),
  project: "all",
  shownStates: new Set(ACTIVE_STATES),
  pending: approvalIndex([{ chat_id: 3 }]),
};
const keys = (r: ReturnType<typeof activeChatGroups>) => r.groups.map((g) => [g.key, g.items.map((i) => i.key)]);

test("activeChatGroups: 下書き → 作業中・回答待ち・未読の順にまとめ、既読・アーカイブ済みは出さない", () => {
  const r = activeChatGroups(base);
  assert.deepEqual(r.groups.map((g) => g.label), ["下書き", "作業中", "回答待ち", "未読"]);
  assert.deepEqual(r.items.map((i) => i.key), ["draft:kanban:1:new:1", "draft:kanban:2:new:2", "chat:1", "chat:3", "chat:2"]);
  assert.equal(r.total, 5);
  assert.deepEqual(r.stateCounts, { draft: 2, running: 1, needs_input: 1, unread: 1 });
});

test("activeChatGroups: 文字はチャット・下書きの名前とプロジェクト名で絞る", () => {
  assert.deepEqual(keys(activeChatGroups({ ...base, query: "書きかけ" })), [["draft", ["draft:kanban:1:new:1"]]]);
  assert.deepEqual(activeChatGroups({ ...base, query: "BETA" }).items.map((i) => i.key), ["draft:kanban:2:new:2", "chat:3"]);
});

test("activeChatGroups: プロジェクトで絞ると状態の数もそのプロジェクトの分。選択肢は数のあるプロジェクトと選んでいるもの", () => {
  const r = activeChatGroups({ ...base, project: 2 });
  assert.equal(r.selected, 2);
  assert.deepEqual(r.items.map((i) => i.key), ["draft:kanban:2:new:2", "chat:3"]);
  assert.deepEqual(r.stateCounts, { draft: 1, running: 0, needs_input: 1, unread: 0 });
  // 選択肢の数はプロジェクトで絞る前のもの
  assert.deepEqual(r.options.map((o) => [o.id, o.count]), [[1, 3], [2, 2]]);
});

test("activeChatGroups: 選んでいたプロジェクトが隠れたら「すべて」に戻す", () => {
  const r = activeChatGroups({ ...base, projects: [alpha], project: 2 });
  assert.equal(r.selected, "all");
  assert.deepEqual(r.items.map((i) => i.key), ["draft:kanban:1:new:1", "chat:1", "chat:2"]);
});

test("activeChatGroups: 隠した状態は並べないが、状態の数には入れる", () => {
  const r = activeChatGroups({ ...base, shownStates: new Set(["unread"] as const) });
  assert.deepEqual(r.groups.map((g) => g.label), ["未読"]);
  assert.deepEqual(r.items.map((i) => i.key), ["chat:2"]);
  assert.equal(r.total, 1);
  assert.equal(r.stateCounts.draft, 2);
});
