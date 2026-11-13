// チャットの AI が読むだけのツールの中身（同じプロジェクトのチャットの一覧・会話・使用枠。ほかのプロジェクトは読めない）
import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanUsage } from "@shared/types";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore } from "../testing/testCore.js";
import { createAiChatReadTools, usageText } from "./aiChatRead.js";

function setup() {
  const ctx = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s", turns: 1, result: "" })));
  const base = { project_id: ctx.project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, memo_path: null };
  const root = ctx.store.chats.create({ ...base, title: "根", parent_chat_id: null });
  const child = ctx.store.chats.create({ ...base, title: "子", parent_chat_id: root.id });
  const other = ctx.store.chats.create({ ...base, title: "よそ", parent_chat_id: null, status: "failed" });
  const project2 = ctx.store.projects.create({ name: "q", repo_path: "/tmp/q-not-used", provider: "claude" });
  const outside = ctx.store.chats.create({ ...base, project_id: project2.id, title: "別のプロジェクト", parent_chat_id: null });
  return { ...ctx, root, child, other, outside };
}

test("list_project_chats: 同じプロジェクトのチャット（子チャットも）を、状態・関係と一緒に返す（ほかのプロジェクトは入れない）", () => {
  const ctx = setup();
  const tools = createAiChatReadTools({ store: ctx.store, approvals: ctx.approvals }, ctx.child.id);
  // 親チャットが回答待ち
  ctx.approvals.request({ chatId: ctx.root.id, projectId: ctx.project.id }, { kind: "permission", toolName: "Bash", input: {}, canRemember: false }, new AbortController().signal);
  const listed = JSON.parse(tools.listProjectChats());
  const byId = new Map(listed.chats.map((c: { id: number }) => [c.id, c]));
  assert.equal(listed.self_id, ctx.child.id);
  assert.deepEqual(
    [ctx.root, ctx.child, ctx.other].map((c) => {
      const row = byId.get(c.id) as { state: string; relation: string };
      return [row.state, row.relation];
    }),
    [
      ["回答待ち", "親"],
      ["終わった", "自分"],
      ["失敗", "ほかの家系"],
    ],
  );
  assert.equal(byId.has(ctx.outside.id), false);
});

test("read_chat: 同じプロジェクトのチャットの会話を読み、ほかのプロジェクト・ない ID は断る", () => {
  const ctx = setup();
  ctx.store.events.add(ctx.other.id, { type: "user", text: "経緯を決めて", message_uuid: "u1" });
  ctx.store.events.add(ctx.other.id, { type: "tool_use", id: "t1", name: "Write", input: { content: "大きな中身".repeat(1000) } });
  // サブエージェントの呼び出し（記録から読むときも parent を残し、数えない）
  ctx.store.events.add(ctx.other.id, { type: "tool_use", id: "t2", name: "Read", input: {}, parent: "a1" });
  ctx.store.events.add(ctx.other.id, { type: "text", text: "A 案に決めました" });
  const tools = createAiChatReadTools({ store: ctx.store, approvals: ctx.approvals }, ctx.child.id);
  const read = tools.readChat({ chat_id: ctx.other.id });
  assert.match(read, /チャット「よそ」（ID \d+・ほかの家系・失敗）の会話: 全 1 回のうち 1 回目/);
  assert.match(read, /\[AI\]（ツール 1 回）\nA 案に決めました/);
  assert.ok(!read.includes("大きな中身"));
  assert.throws(() => tools.readChat({ chat_id: ctx.outside.id }), /このプロジェクトにありません/);
  assert.throws(() => tools.readChat({ chat_id: 9999 }), /このプロジェクトにありません/);
});

test("get_usage: 使った割合と残り・リセットの時刻（取れなければその理由）", async () => {
  const usage: PlanUsage = {
    provider: "claude",
    provider_label: "Claude",
    available: true,
    plan: "Max",
    five_hour: { key: "five_hour", label: "5 時間", utilization: 42.4, resets_at: "2026-11-13T15:00:00Z" },
    seven_day: { key: "seven_day", label: "週", utilization: null, resets_at: null },
    model_weekly: [],
    fetched_at: "2026-11-13T12:00:00Z",
  };
  const text = usageText(usage);
  assert.match(text, /5 時間: 42% 使用（残り 58%）・2026-11-13T15:00:00Z にリセット/);
  assert.match(text, /週: まだ始まっていません/);
  assert.match(usageText({ ...usage, available: false, error: "API キー" }), /取得できません（API キー）/);
  const ctx = setup();
  await assert.rejects(createAiChatReadTools({ store: ctx.store, approvals: ctx.approvals }, ctx.child.id).usage(), /使用枠を読む口がない/);
});
