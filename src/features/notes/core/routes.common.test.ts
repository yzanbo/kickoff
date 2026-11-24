// API のテスト: 共通のノート（見えないプロジェクトを用意する・フォルダの設定に付いていく・重なれば使えない・どのチャットの AI からも読み書き・ノートのチャット・検索）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { setup } from "@/app/core/testing/testServer";
import { until } from "@/app/core/testing/testCore";
import { chatOf } from "@/features/chat/core/testing";

const FEATURES = ["notes", "settings", "trash", "database", "workplaceMove"] as const;

/** 共通のノートを用意したコア（common はいまの共通のノートのプロジェクト） */
async function setupCommon() {
  const ctx = setup({ features: FEATURES });
  await ctx.notes.syncCommon();
  const defaults = async () => (await ctx.api("GET /api/notes/defaults")).body;
  const common = () => ctx.store.projects.list().find((p) => p.kind === "common");
  return { ...ctx, defaults, common };
}

test("共通のノート: 親フォルダの下の _common に見えないプロジェクトを 1 つ用意し（本体とノートのフォルダが同じ）、合わせ直しても増やさない", async () => {
  const { defaults, common, noteFake, notes, store } = await setupCommon();
  const dir = path.join(noteFake.defaultDir, "_common");
  const real = fs.realpathSync(dir);
  const project = common();
  assert.ok(project);
  assert.deepEqual([project.name, project.repo_path, project.note_dir], ["共通のノート", real, real]);
  assert.deepEqual(await defaults(), { default_dir: noteFake.defaultDir, common_default_dir: dir, common_project_id: project.id, common_unavailable: null });
  // コアが動いている間はフォルダがいつもある（消されても、合わせ直すと作る）
  fs.rmSync(real, { recursive: true }); // test-rules-ignore: 一時フォルダの中を消して、作り直すかを見る
  await notes.syncCommon();
  assert.ok(fs.existsSync(real));
  assert.equal(store.projects.list().filter((p) => p.kind === "common").length, 1);
});

test("共通のノート: 同じ名前のプロジェクトのノートのフォルダは _common-2（共通のノートと重ねない）", async () => {
  const { api, store, noteFake } = await setupCommon();
  const named = store.projects.create({ name: "_common", repo_path: tempDir(), provider: "claude" });
  assert.equal((await api("GET /api/projects/:projectId/notes", { params: { projectId: named.id } })).body.dir, path.join(noteFake.defaultDir, "_common-2"));
});

test("共通のノート: ノートの API で読み書きでき、ノートのチャットは共通のノートのフォルダで動く。ふつうのチャットの AI にも共通のノートのフォルダを渡す", async () => {
  const ctx = await setupCommon();
  const { api, provider, project } = ctx;
  const common = ctx.common()!;
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: common.id }, body: { path: "覚え書き.md", content: "# 覚え書き\n買うもの" } })).status, 201);
  assert.ok(fs.existsSync(path.join(common.repo_path, "覚え書き.md")));
  // ノートのチャット: 作業場所は共通のノートのフォルダ。プロジェクトに属さないと伝え、二重に足さない
  const chat = (await api("POST /api/projects/:projectId/note/chat", { params: { projectId: common.id }, body: { path: "覚え書き.md", text: "整えて" } })).body;
  await until(async () => (await chatOf(ctx, chat.id)).status === "completed");
  assert.equal(provider.lastCwd, common.repo_path);
  assert.equal(provider.lastDirs.filter((d) => d === common.repo_path).length, 1);
  assert.match(provider.lastSystemPrompt, /このチャットは、どのプロジェクトにも属しません/);
  assert.match(provider.lastSystemPrompt, /このノートは「共通のノート」/);
  assert.doesNotMatch(provider.lastSystemPrompt, /プロジェクトフォルダ: /);
  // ふつうのプロジェクトのチャット: 共通のノートのフォルダも書ける場所に足し、分けて伝える
  const plain = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "共通のノートを見て" } })).body;
  await until(async () => (await chatOf(ctx, plain.id)).status === "completed");
  assert.ok(provider.lastDirs.includes(common.repo_path));
  assert.ok(provider.lastSystemPrompt.includes(`共通のノートのフォルダ \`${common.repo_path}\``));
  // ⌘K のノートの全文検索は共通のノートも探す
  const hits = (await api("GET /api/notes/search", { query: { q: "買うもの" } })).body.hits;
  assert.deepEqual(hits.map((h: { project_id: number; path: string }) => [h.project_id, h.path]), [[common.id, "覚え書き.md"]]);
});

test("共通のノート: フォルダの設定を変えると付け替え、チャットも新しい場所で動く。作業中のチャットがあれば断り、利用者のプロジェクトのフォルダは選べない", async () => {
  const ctx = await setupCommon();
  const { api, call, provider, runner, store, project } = ctx;
  const common = ctx.common()!;
  await api("POST /api/projects/:projectId/notes", { params: { projectId: common.id }, body: { path: "a.md", content: "a" } });
  const chat = (await api("POST /api/projects/:projectId/note/chat", { params: { projectId: common.id }, body: { path: "a.md", text: "1" } })).body;
  await until(async () => (await chatOf(ctx, chat.id)).status === "completed");
  const moved = path.join(tempDir(), "共通");
  // 作業中なら 409 で、設定も変えない
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "2" } });
  await until(() => runner.isBusy(chat.id));
  const refused = await call("PUT", "/api/settings", { common_notes_dir: moved });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /作業中の共通のノートのチャット/);
  assert.equal((await call("GET", "/api/settings")).body.common_notes_dir, null);
  release();
  await until(() => !runner.isBusy(chat.id));
  // 利用者のプロジェクトのフォルダは 409
  assert.equal((await call("PUT", "/api/settings", { common_notes_dir: project.repo_path })).status, 409);
  // 変えると本体とノートのフォルダを付け替え、チャットは区切りを置いて新しいフォルダで動く
  assert.equal((await call("PUT", "/api/settings", { common_notes_dir: moved })).status, 200);
  const real = fs.realpathSync(moved);
  assert.deepEqual([store.projects.get(common.id)?.repo_path, store.projects.get(common.id)?.note_dir], [real, real]);
  assert.ok(store.events.list(chat.id).some((e) => e.type === "workplace_moved" && e.data.reason === "folder_moved"));
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "3" } });
  await until(async () => (await chatOf(ctx, chat.id)).status === "completed" && provider.prompts.length === 3);
  assert.equal(provider.lastCwd, real);
  // 既定に戻せる
  await call("PUT", "/api/settings", { common_notes_dir: null });
  assert.equal(store.projects.get(common.id)?.repo_path, common.repo_path);
});

test("共通のノート: 親フォルダを変えて _common が利用者のプロジェクトと重なれば、付け替えずに使えない状態にし、理由を返す（AI にも渡さない）", async () => {
  const ctx = await setupCommon();
  const { api, call, store, provider, project, defaults } = ctx;
  const common = ctx.common()!;
  const root = tempDir();
  const clash = store.projects.create({ name: "重なる", repo_path: fs.realpathSync(fs.mkdirSync(path.join(root, "_common"), { recursive: true })!), provider: "claude" });
  assert.equal((await call("PUT", "/api/settings", { notes_dir: root })).status, 200);
  const now = await defaults();
  assert.equal(now.common_project_id, null);
  assert.equal(now.common_unavailable?.project_id, clash.id);
  assert.match(now.common_unavailable?.message ?? "", /「重なる」/);
  assert.equal(store.projects.get(common.id)?.repo_path, common.repo_path);
  const plain = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "x" } })).body;
  await until(async () => (await chatOf(ctx, plain.id)).status === "completed");
  assert.doesNotMatch(provider.lastSystemPrompt, /共通のノート/);
  // 親フォルダを戻せば、また使える
  await call("PUT", "/api/settings", { notes_dir: null });
  assert.equal((await defaults()).common_project_id, common.id);
});
