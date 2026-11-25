// API のテスト: 欄の間（共通のノートとプロジェクト・プロジェクトどうし）でノートを動かす（ノートのチャットと子チャットも行き先のプロジェクトへ移す・作業中・同じ名前・使えない行き先は断る）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { setup } from "@/app/core/testing/testServer";
import { until } from "@/app/core/testing/testCore";
import { chatOf } from "@/features/chat/core/testing";

const FEATURES = ["notes", "settings", "trash", "database", "workplaceMove"] as const;

/** 共通のノートと、もう 1 つのプロジェクトを用意したコア */
async function setupTransfer() {
  const ctx = setup({ features: FEATURES });
  await ctx.notes.syncCommon();
  const common = ctx.store.projects.list().find((p) => p.kind === "common")!;
  const other = ctx.store.projects.create({ name: "もう 1 つ", repo_path: tempDir(), provider: "claude" });
  const events: BusEvent[] = [];
  ctx.bus.subscribe((e) => events.push(e));
  const create = (projectId: number, file: string) => ctx.api("POST /api/projects/:projectId/notes", { params: { projectId }, body: { path: file, content: file } });
  const move = (projectId: number, body: { from: string; to: string; to_project_id?: number }) => ctx.api("POST /api/projects/:projectId/notes/move", { params: { projectId }, body });
  /** ノートのチャットを始めて、終わるまで待つ */
  const noteChat = async (projectId: number, file: string) => {
    const chat = (await ctx.api("POST /api/projects/:projectId/note/chat", { params: { projectId }, body: { path: file, text: "整えて" } })).body;
    await until(async () => (await chatOf(ctx, chat.id)).status === "completed");
    return chat.id as number;
  };
  const dirOf = async (projectId: number) => (await ctx.api("GET /api/projects/:projectId/notes", { params: { projectId } })).body.dir as string;
  return { ...ctx, common, other, events, create, move, noteChat, dirOf };
}

test("欄の間: プロジェクトのノートを共通のノートへ動かすと、ノートのチャットと子チャットも移り、区切りを置いて共通の作業フォルダで続く", async () => {
  const ctx = await setupTransfer();
  const { project, common, store, provider, events, create, move, noteChat, dirOf } = ctx;
  await create(project.id, "案.md");
  const chatId = await noteChat(project.id, "案.md");
  const child = store.chats.create({ project_id: project.id, provider: "claude", title: "子", status: "completed", model: null, effort: null, permission_mode: "default", fast_mode: false, group_id: null, worktree_path: null, parent_chat_id: chatId, parent_event_id: null, note_path: null });
  events.length = 0;
  assert.deepEqual((await move(project.id, { from: "案.md", to: "メモ/案.md", to_project_id: common.id })).body, { path: "メモ/案.md" });
  assert.ok(fs.existsSync(path.join(common.note_dir!, "メモ", "案.md")));
  assert.ok(!fs.existsSync(path.join(await dirOf(project.id), "案.md")));
  const moved = store.chats.get(chatId)!;
  assert.deepEqual([moved.project_id, moved.note_path], [common.id, "メモ/案.md"]);
  assert.equal(store.chats.get(child.id)?.project_id, common.id);
  assert.ok(store.events.list(chatId).some((e) => e.type === "workplace_moved" && e.data.reason === "project_moved" && e.data.to.project_id === common.id));
  // 両方の欄に知らせる
  const notified = new Set(events.flatMap((e) => (e.type === "notes" ? [e.project_id] : [])));
  assert.ok(notified.has(project.id) && notified.has(common.id));
  // 移った先で続けると、作業場所は共通の作業フォルダ（ノートのフォルダは読み書きできる場所）
  await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: "続けて" } });
  await until(async () => (await chatOf(ctx, chatId)).status === "completed" && provider.prompts.length === 2);
  assert.equal(provider.lastCwd, common.repo_path);
  assert.ok(provider.lastDirs.includes(common.note_dir!));
});

test("欄の間: プロジェクトどうしでフォルダごと動かすと、中のノートのチャットも移る。チャットのないノートはファイルだけ。共通のノートからも戻せる", async () => {
  const ctx = await setupTransfer();
  const { project, other, common, store, create, move, noteChat, dirOf } = ctx;
  await create(project.id, "設計/画面.md");
  await create(project.id, "設計/DB.md");
  const chatId = await noteChat(project.id, "設計/画面.md");
  // 行き先のノートのフォルダはまだ決めていない（動かすときに決めて作る）
  assert.equal(store.projects.get(other.id)?.note_folder, null);
  assert.equal((await move(project.id, { from: "設計", to: "前の設計", to_project_id: other.id })).status, 200);
  const otherDir = await dirOf(other.id);
  assert.ok(fs.existsSync(path.join(otherDir, "前の設計", "画面.md")) && fs.existsSync(path.join(otherDir, "前の設計", "DB.md")));
  assert.deepEqual([store.chats.get(chatId)?.project_id, store.chats.get(chatId)?.note_path], [other.id, "前の設計/画面.md"]);
  // チャットのないノート: 共通のノートへ動かして戻す
  await create(common.id, "覚え書き.md");
  assert.equal((await move(common.id, { from: "覚え書き.md", to: "覚え書き.md", to_project_id: other.id })).status, 200);
  assert.ok(fs.existsSync(path.join(otherDir, "覚え書き.md")) && !fs.existsSync(path.join(common.repo_path, "覚え書き.md")));
  // 行き先が同じプロジェクトなら、ふつうの移動
  assert.deepEqual((await move(other.id, { from: "覚え書き.md", to: "前の設計/覚え書き.md", to_project_id: other.id })).body, { path: "前の設計/覚え書き.md" });
});

test("欄の間: 作業中のノートのチャット・同じ名前・アーカイブしたプロジェクト・ないプロジェクト・使えない共通のノートへは断り、ファイルもチャットも動かさない", async () => {
  const ctx = await setupTransfer();
  const { project, other, common, store, provider, runner, create, move, noteChat, dirOf } = ctx;
  await create(project.id, "案.md");
  const chatId = await noteChat(project.id, "案.md");
  const projectDir = await dirOf(project.id);
  // 作業中なら 409（理由つき）
  const release = provider.hold();
  await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: "もう一度" } });
  await until(() => runner.isBusy(chatId));
  const busy = await ctx.call("POST", `/api/projects/${project.id}/notes/move`, { from: "案.md", to: "案.md", to_project_id: common.id });
  assert.equal(busy.status, 409);
  assert.match(busy.body.error, /作業中なので、ほかの欄へ動かせません/);
  release();
  await until(() => !runner.isBusy(chatId));
  assert.ok(fs.existsSync(path.join(projectDir, "案.md")));
  // 同じ名前は上書きしない
  await create(other.id, "案.md");
  assert.equal((await move(project.id, { from: "案.md", to: "案.md", to_project_id: other.id })).status, 409);
  assert.equal(fs.readFileSync(path.join(await dirOf(other.id), "案.md"), "utf8"), "案.md");
  // アーカイブしたプロジェクト・ないプロジェクト
  store.projects.update(other.id, { archived_at: new Date().toISOString() });
  assert.equal((await move(project.id, { from: "案.md", to: "別.md", to_project_id: other.id })).status, 409);
  assert.equal((await move(project.id, { from: "案.md", to: "別.md", to_project_id: 9999 })).status, 404);
  // 共通のノートが使えない（親フォルダを変えて _common が利用者のプロジェクトと重なった）
  const root = tempDir();
  store.projects.create({ name: "重なる", repo_path: fs.realpathSync(fs.mkdirSync(path.join(root, "_common"), { recursive: true })!), provider: "claude" });
  await ctx.call("PUT", "/api/settings", { notes_dir: root });
  const unavailable = await ctx.call("POST", `/api/projects/${project.id}/notes/move`, { from: "案.md", to: "別.md", to_project_id: common.id });
  assert.equal(unavailable.status, 409);
  assert.match(unavailable.body.error, /共通のノートを使えないため/);
  assert.ok(fs.existsSync(path.join(projectDir, "案.md")));
  assert.equal(store.chats.get(chatId)?.project_id, project.id);
});
