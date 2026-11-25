// チャットの AI が読むだけのツールの中身（read.ts。同じプロジェクトのチャットの一覧・会話。ほかのプロジェクトは共通のチャットからだけ）
import assert from "node:assert/strict";
import { test } from "vitest";
import { ScriptedProvider } from "@/features/ai/core/testing";
import { setupCore, testUploads } from "@/app/core/testing/testCore";
import { createAiChatReadTools } from "./read";

function setup() {
  const ctx = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s", turns: 1, result: "" })));
  const base = { project_id: ctx.project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, note_path: null };
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

test("read_chat: 省略された長い発言を記録 ID と文字位置で最後まで読み、ほかのチャットや非公開の記録は読ませない", () => {
  const ctx = setup();
  const long = "あ😀".repeat(2_501);
  const user = ctx.store.events.add(ctx.other.id, { type: "user", text: long, message_uuid: "u1" });
  const answer = ctx.store.events.add(ctx.other.id, { type: "text", text: "答え".repeat(2_100) });
  const hidden = ctx.store.events.add(ctx.other.id, { type: "user", text: "圧縮用", pre_compact: true, message_uuid: "u2" });
  const subagent = ctx.store.events.add(ctx.other.id, { type: "text", text: "子の内部", parent: "sub" });
  const outside = ctx.store.events.add(ctx.outside.id, { type: "user", text: "別のプロジェクト", message_uuid: "u3" });
  const tools = createAiChatReadTools({ store: ctx.store, approvals: ctx.approvals }, ctx.child.id);
  const listed = tools.readChat({ chat_id: ctx.other.id, turns: 2 });
  assert.match(listed, new RegExp(`event_id に ${user.id}`));
  assert.match(listed, new RegExp(`event_id に ${answer.id}`));
  const first = JSON.parse(tools.readChat({ chat_id: ctx.other.id, event_id: user.id }));
  const second = JSON.parse(tools.readChat({ chat_id: ctx.other.id, event_id: user.id, offset: first.next_offset }));
  assert.equal(first.text + second.text, long);
  assert.equal(second.next_offset, null);
  assert.throws(() => tools.readChat({ chat_id: ctx.other.id, event_id: hidden.id }), /読める発言がありません/);
  assert.throws(() => tools.readChat({ chat_id: ctx.other.id, event_id: subagent.id }), /読める発言がありません/);
  assert.throws(() => tools.readChat({ chat_id: ctx.other.id, event_id: outside.id }), /読める発言がありません/);
  assert.throws(() => tools.readChat({ chat_id: ctx.other.id, event_id: user.id, turns: 1 }), /同時に指定できません/);
  assert.throws(() => tools.readChat({ chat_id: ctx.other.id, offset: 3 }), /event_id が必要/);
});

test("read_chat: 添付のある発言は場所を後から読み、欠けた添付も知らせる。他プロジェクトは読ませない", async () => {
  const ctx = setup();
  const uploads = testUploads();
  const file = await uploads.save({ name: "資料.txt", type: "text/plain", bytes: new TextEncoder().encode("秘密の内容") });
  const missing = { ...file, id: "00000000-0000-0000-0000-000000000000", name: "消えた.txt" };
  const event = ctx.store.events.add(ctx.other.id, { type: "user", text: "確認して", message_uuid: "u", attachments: [file, missing] });
  const outside = ctx.store.events.add(ctx.outside.id, { type: "user", text: "別", message_uuid: "v", attachments: [file] });
  const attachments = { locate: async (a: { id: string }) => (await uploads.resolve(a.id))?.path ?? null };
  const tools = createAiChatReadTools({ store: ctx.store, approvals: ctx.approvals, attachments }, ctx.child.id);
  assert.match(tools.readChat({ chat_id: ctx.other.id }), new RegExp(`event_id に ${event.id}`));
  const result = JSON.parse(await tools.readChatWithAttachments({ chat_id: ctx.other.id, event_id: event.id }));
  assert.equal(result.attachments[0].path, (await uploads.resolve(file.id))?.path);
  assert.equal(result.attachments[1].unavailable, true);
  assert.doesNotMatch(JSON.stringify(result), /秘密の内容/);
  await assert.rejects(tools.readChatWithAttachments({ chat_id: ctx.outside.id, event_id: outside.id }), /このプロジェクトにありません/);
  await assert.rejects(tools.readChatWithAttachments({ chat_id: ctx.other.id, event_id: outside.id }), /読める発言がありません/);
});

/** 共通のプロジェクトと、その中のチャット・アーカイブしたプロジェクト・ゴミ箱のプロジェクトを足す */
function setupCommon() {
  const ctx = setup();
  const base = { provider: "claude" as const, status: "completed" as const, parent_chat_id: null, note_path: null };
  const common = ctx.store.projects.create({ name: "共通", repo_path: "/tmp/common-not-used", provider: "claude", kind: "common" });
  const commonChat = ctx.store.chats.create({ ...base, project_id: common.id, title: "相談" });
  const archived = ctx.store.projects.create({ name: "しまった", repo_path: "/tmp/archived-not-used", provider: "claude" });
  ctx.store.projects.update(archived.id, { archived_at: "2026-01-01T00:00:00.000Z" });
  const archivedChat = ctx.store.chats.create({ ...base, project_id: archived.id, title: "しまったチャット" });
  const trashed = ctx.store.projects.create({ name: "消した", repo_path: "/tmp/trashed-not-used", provider: "claude" });
  const trashedChat = ctx.store.chats.create({ ...base, project_id: trashed.id, title: "消したチャット" });
  ctx.store.projects.setTrashed(trashed.id, "2026-01-01T00:00:00.000Z");
  return { ...ctx, common, commonChat, archived, archivedChat, trashed, trashedChat };
}

test("共通のチャット: project（名前・ID）でほかのプロジェクトのチャットの一覧と会話を読め、アーカイブ・ゴミ箱のプロジェクトは指せない", () => {
  const ctx = setupCommon();
  ctx.store.events.add(ctx.outside.id, { type: "user", text: "決めて", message_uuid: "u1" });
  ctx.store.events.add(ctx.outside.id, { type: "text", text: "q で決めたこと" });
  const tools = createAiChatReadTools({ store: ctx.store, approvals: ctx.approvals }, ctx.commonChat.id);
  // 省けば共通の中
  assert.deepEqual(JSON.parse(tools.listProjectChats()).chats.map((c: { id: number }) => c.id), [ctx.commonChat.id]);
  // 名前（大文字・小文字・全角の違いも）か ID で、ほかのプロジェクトの一覧
  for (const project of ["q", "Ｑ", ctx.outside.project_id]) {
    const listed = JSON.parse(tools.listProjectChats({ project }));
    assert.deepEqual(listed.project, { id: ctx.outside.project_id, name: "q" });
    assert.deepEqual(listed.chats.map((c: { id: number; relation: string }) => [c.id, c.relation]), [[ctx.outside.id, "ほかのプロジェクト"]]);
  }
  // 会話は project を省いても、指しても読める（違うプロジェクトを指したら断る）
  assert.match(tools.readChat({ chat_id: ctx.outside.id }), /プロジェクト「q」のチャット「別のプロジェクト」（ID \d+・ほかのプロジェクト・終わった）[\s\S]*q で決めたこと/);
  assert.match(tools.readChat({ chat_id: ctx.outside.id, project: "q" }), /q で決めたこと/);
  assert.throws(() => tools.readChat({ chat_id: ctx.outside.id, project: "p" }), /プロジェクト「p」にありません/);
  // アーカイブ・ゴミ箱のプロジェクトは名前・ID でも指せず、そのチャットも読めない
  for (const project of ["しまった", ctx.archived.id, "消した", ctx.trashed.id]) {
    assert.throws(() => tools.listProjectChats({ project }), /見つかりません（指せるのは、アーカイブしていないプロジェクトだけです）/);
  }
  assert.throws(() => tools.readChat({ chat_id: ctx.archivedChat.id }), /このプロジェクトにありません/);
  assert.throws(() => tools.readChat({ chat_id: ctx.trashedChat.id }), /このプロジェクトにありません/);
});

test("プロジェクトのチャット: project でほかのプロジェクト・共通を指すと断り、自分のプロジェクトはいまどおり読める", () => {
  const ctx = setupCommon();
  const tools = createAiChatReadTools({ store: ctx.store, approvals: ctx.approvals }, ctx.child.id);
  for (const project of ["q", ctx.outside.project_id, "共通", ctx.common.id]) {
    assert.throws(() => tools.listProjectChats({ project }), /プロジェクトのチャットからは、ほかのプロジェクトを指せません/);
  }
  assert.throws(() => tools.readChat({ chat_id: ctx.outside.id, project: "q" }), /ほかのプロジェクトを指せません/);
  assert.throws(() => tools.readChat({ chat_id: ctx.commonChat.id }), /このプロジェクトにありません/);
  assert.equal(JSON.parse(tools.listProjectChats({ project: "p" })).chats.length, 3);
  assert.equal(JSON.parse(tools.listProjectChats({ project: "p" })).project, undefined);
});
