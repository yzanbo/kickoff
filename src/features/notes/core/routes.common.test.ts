// API のテスト: 共通（共通のチャットと共通のノートの持ち主を用意する・本体の作業フォルダとノートのフォルダ・フォルダの設定に付いていく・前の版からの付け替え・重なれば使えない・
// どのチャットの AI からも読み書き・ノートのチャット・検索）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { setup } from "@/app/core/testing/testServer";
import { until } from "@/app/core/testing/testCore";
import { chatOf } from "@/features/chat/core/testing";
import type { BusEvent } from "@shared/foundation/contract";

const FEATURES = ["notes", "settings", "trash", "database", "workplaceMove"] as const;

/** 共通を用意したコア（common はいまの共通のプロジェクト） */
async function setupCommon() {
  const ctx = setup({ features: FEATURES });
  await ctx.notes.syncCommon();
  const defaults = async () => (await ctx.api("GET /api/notes/defaults")).body;
  const common = () => ctx.store.projects.list().find((p) => p.kind === "common");
  return { ...ctx, defaults, common };
}

test("共通: 親フォルダの下に、本体の作業フォルダ .common-work とノートのフォルダ _common を分けて 1 つ用意し、合わせ直しても増やさない", async () => {
  const { defaults, common, noteFake, notes, store } = await setupCommon();
  const dir = path.join(noteFake.defaultDir, "_common");
  const real = fs.realpathSync(dir);
  const work = fs.realpathSync(path.join(noteFake.defaultDir, ".common-work"));
  const project = common();
  assert.ok(project);
  assert.deepEqual([project.name, project.repo_path, project.note_dir], ["共通", work, real]);
  assert.deepEqual(await defaults(), { default_dir: noteFake.defaultDir, common_default_dir: dir, common_project_id: project.id, common_unavailable: null });
  // コアが動いている間は 2 つのフォルダがいつもある（消されても、合わせ直すと作る）
  fs.rmSync(real, { recursive: true }); // test-rules-ignore: 一時フォルダの中を消して、作り直すかを見る
  fs.rmSync(work, { recursive: true }); // test-rules-ignore: 一時フォルダの中を消して、作り直すかを見る
  await notes.syncCommon();
  assert.ok(fs.existsSync(real) && fs.existsSync(work));
  assert.equal(store.projects.list().filter((p) => p.kind === "common").length, 1);
});

test("共通: 前の版のデータ（名前「共通のノート」・本体とノートのフォルダが同じ _common）から起動すると、名前を「共通」に、本体を .common-work に付け替え、チャットは区切りを置いて作業フォルダで動く", async () => {
  const ctx = setup({ features: FEATURES });
  const { api, store, noteFake, provider } = ctx;
  fs.mkdirSync(path.join(noteFake.defaultDir, "_common"), { recursive: true });
  const old = fs.realpathSync(path.join(noteFake.defaultDir, "_common"));
  const legacy = store.projects.create({ name: "共通のノート", repo_path: old, provider: "claude", kind: "common" });
  store.projects.update(legacy.id, { note_dir: old });
  fs.writeFileSync(path.join(old, "a.md"), "a");
  const chat = (await api("POST /api/projects/:projectId/note/chat", { params: { projectId: legacy.id }, body: { path: "a.md", text: "1" } })).body;
  await until(async () => (await chatOf(ctx, chat.id)).status === "completed");
  await ctx.notes.syncCommon();
  const work = fs.realpathSync(path.join(noteFake.defaultDir, ".common-work"));
  const now = store.projects.get(legacy.id);
  assert.deepEqual([now?.name, now?.repo_path, now?.note_dir], ["共通", work, old]);
  assert.equal(store.projects.list().filter((p) => p.kind === "common").length, 1);
  assert.ok(store.events.list(chat.id).some((e) => e.type === "workplace_moved" && e.data.reason === "folder_moved"));
  // ノートのチャットは作業フォルダで動き、ノートはそのまま読める
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "2" } });
  await until(async () => (await chatOf(ctx, chat.id)).status === "completed" && provider.prompts.length === 2);
  assert.equal(provider.lastCwd, work);
  assert.ok(provider.lastDirs.includes(old));
  assert.equal((await api("GET /api/projects/:projectId/note", { params: { projectId: legacy.id }, query: { path: "a.md" } })).body.content, "a");
});

test("共通: 同じ名前のプロジェクトのノートのフォルダは _common-2（共通のノートと重ねない）", async () => {
  const { api, store, noteFake } = await setupCommon();
  const named = store.projects.create({ name: "_common", repo_path: tempDir(), provider: "claude" });
  assert.equal((await api("GET /api/projects/:projectId/notes", { params: { projectId: named.id } })).body.dir, path.join(noteFake.defaultDir, "_common-2"));
});

test("共通: ノートの API でノートのフォルダを読み書きでき、ノートのチャットは作業フォルダで動く。ふつうのチャットの AI にも共通のノートのフォルダを渡す", async () => {
  const ctx = await setupCommon();
  const { api, provider, project } = ctx;
  const common = ctx.common()!;
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: common.id }, body: { path: "覚え書き.md", content: "# 覚え書き\n買うもの" } })).status, 201);
  assert.ok(fs.existsSync(path.join(common.note_dir!, "覚え書き.md")));
  assert.ok(!fs.existsSync(path.join(common.repo_path, "覚え書き.md")));
  // ノートのチャット: 作業場所は共通の作業フォルダ、ノートのフォルダは読み書きできる場所。プロジェクトに属さないと伝え、二重に足さない
  const chat = (await api("POST /api/projects/:projectId/note/chat", { params: { projectId: common.id }, body: { path: "覚え書き.md", text: "整えて" } })).body;
  await until(async () => (await chatOf(ctx, chat.id)).status === "completed");
  assert.equal(provider.lastCwd, common.repo_path);
  assert.equal(provider.lastDirs.filter((d) => d === common.note_dir).length, 1);
  assert.match(provider.lastSystemPrompt, /このチャットは、どのプロジェクトにも属しません/);
  assert.match(provider.lastSystemPrompt, /このノートは「共通のノート」/);
  assert.doesNotMatch(provider.lastSystemPrompt, /プロジェクトフォルダ: /);
  // ふつうのプロジェクトのチャット: 共通のノートのフォルダも書ける場所に足し、分けて伝える
  const plain = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "共通のノートを見て" } })).body;
  await until(async () => (await chatOf(ctx, plain.id)).status === "completed");
  assert.ok(provider.lastDirs.includes(common.note_dir!));
  assert.ok(!provider.lastDirs.includes(common.repo_path));
  assert.ok(provider.lastSystemPrompt.includes(`共通のノートのフォルダ \`${common.note_dir}\``));
  // ⌘K のノートの全文検索は共通のノートも探す
  const hits = (await api("GET /api/notes/search", { query: { q: "買うもの" } })).body.hits;
  assert.deepEqual(hits.map((h: { project_id: number; path: string }) => [h.project_id, h.path]), [[common.id, "覚え書き.md"]]);
});

test("共通: 共通のノートのフォルダの設定はノートのフォルダだけを、親フォルダの設定は両方を付け替える（本体が変わればチャットは区切りを置いて新しい作業フォルダで動く）。作業中なら断り、利用者のプロジェクト・作業フォルダは選べない", async () => {
  const ctx = await setupCommon();
  const { api, call, provider, runner, store, project } = ctx;
  const common = ctx.common()!;
  await api("POST /api/projects/:projectId/notes", { params: { projectId: common.id }, body: { path: "a.md", content: "a" } });
  const chat = (await api("POST /api/projects/:projectId/note/chat", { params: { projectId: common.id }, body: { path: "a.md", text: "1" } })).body;
  await until(async () => (await chatOf(ctx, chat.id)).status === "completed");
  const moved = path.join(tempDir(), "共通");
  const folders = () => [store.projects.get(common.id)?.repo_path, store.projects.get(common.id)?.note_dir];
  const breaks = () => store.events.list(chat.id).filter((e) => e.type === "workplace_moved" && e.data.reason === "folder_moved").length;
  // 作業中なら 409 で、設定も変えない
  const release = provider.hold();
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "2" } });
  await until(() => runner.isBusy(chat.id));
  const refused = await call("PUT", "/api/settings", { common_notes_dir: moved });
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /作業中の共通のチャット/);
  assert.equal((await call("GET", "/api/settings")).body.common_notes_dir, null);
  release();
  await until(() => !runner.isBusy(chat.id));
  // 利用者のプロジェクトのフォルダ・共通の作業フォルダ（の中）は 409
  assert.equal((await call("PUT", "/api/settings", { common_notes_dir: project.repo_path })).status, 409);
  const inWork = await call("PUT", "/api/settings", { common_notes_dir: path.join(common.repo_path, "notes") });
  assert.equal(inWork.status, 409);
  assert.match(inWork.body.error, /作業フォルダ/);
  // ノートのフォルダだけを付け替える（作業フォルダは変わらないので区切りを置かない）
  assert.equal((await call("PUT", "/api/settings", { common_notes_dir: moved })).status, 200);
  const real = fs.realpathSync(moved);
  assert.deepEqual(folders(), [common.repo_path, real]);
  assert.equal(breaks(), 0);
  // 親フォルダを変えると、作業フォルダが付いていき（ノートのフォルダは選んだまま）、チャットは区切りを置いて新しい作業フォルダで動く
  const root = tempDir();
  assert.equal((await call("PUT", "/api/settings", { notes_dir: root })).status, 200);
  const work = fs.realpathSync(path.join(root, ".common-work"));
  assert.deepEqual(folders(), [work, real]);
  assert.equal(breaks(), 1);
  await api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "3" } });
  await until(async () => (await chatOf(ctx, chat.id)).status === "completed" && provider.prompts.length === 3);
  assert.equal(provider.lastCwd, work);
  // 既定に戻せる
  await call("PUT", "/api/settings", { notes_dir: null, common_notes_dir: null });
  assert.deepEqual(folders(), [common.repo_path, common.note_dir]);
});

test("共通: 親フォルダを変えて .common-work が利用者のプロジェクトと重なれば、付け替えずに使えない状態にし、理由を返す", async () => {
  const ctx = await setupCommon();
  const { call, store, defaults } = ctx;
  const common = ctx.common()!;
  const root = tempDir();
  fs.mkdirSync(path.join(root, ".common-work"));
  const clash = store.projects.create({ name: "作業の重なり", repo_path: fs.realpathSync(path.join(root, ".common-work")), provider: "claude" });
  assert.equal((await call("PUT", "/api/settings", { notes_dir: root })).status, 200);
  const now = await defaults();
  assert.equal(now.common_project_id, null);
  assert.equal(now.common_unavailable?.project_id, clash.id);
  assert.match(now.common_unavailable?.message ?? "", /共通のチャットの作業フォルダ.*「作業の重なり」/);
  assert.equal(store.projects.get(common.id)?.repo_path, common.repo_path);
  await call("PUT", "/api/settings", { notes_dir: null });
  assert.equal((await defaults()).common_project_id, common.id);
});

test("共通: 親フォルダを変えて _common が利用者のプロジェクトと重なれば、付け替えずに使えない状態にし、理由を返す（AI にも渡さない）", async () => {
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

test("共通: _common を予約する前からノートのフォルダが _common のプロジェクトがあれば、重ねずに使えない状態にし、理由を返す", async () => {
  const ctx = setup({ features: FEATURES });
  const old = ctx.store.projects.create({ name: "前からある", repo_path: tempDir(), provider: "claude" });
  ctx.store.projects.update(old.id, { note_folder: "_common" });
  await ctx.notes.syncCommon();
  const now = (await ctx.api("GET /api/notes/defaults")).body;
  assert.equal(now.common_project_id, null);
  assert.equal(now.common_unavailable?.project_id, old.id);
  assert.match(now.common_unavailable?.message ?? "", /「前からある」のノートのフォルダと同じ/);
  // そのプロジェクトのノートのフォルダを変えれば、使える
  ctx.store.projects.update(old.id, { note_folder: "前からある" });
  await ctx.notes.syncCommon();
  assert.ok((await ctx.api("GET /api/notes/defaults")).body.common_project_id);
});

test("ノートのフォルダの場所を変えたら（プロジェクトの別の場所・親フォルダ・共通のノートのフォルダ）、そのプロジェクトの notes を path なしで知らせる（開いている文書が読み直す）", async () => {
  const ctx = await setupCommon();
  const { api, call, bus, project } = ctx;
  const common = ctx.common()!;
  // ノートを書いてフォルダを決めておく
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "a.md", content: "a" } });
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const notified = () => events.filter((e) => e.type === "notes" && e.path === null).map((e) => (e as Extract<BusEvent, { type: "notes" }>).project_id);
  // 名前を変えただけでは知らせない
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { name: "改名" } });
  assert.deepEqual(notified(), []);
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { note_dir: tempDir() } });
  assert.deepEqual(notified(), [project.id]);
  events.length = 0;
  // 共通のノートのフォルダ: 付け替えたあとに知らせる
  assert.equal((await call("PUT", "/api/settings", { common_notes_dir: tempDir() })).status, 200);
  assert.deepEqual(notified(), [common.id]);
  events.length = 0;
  // 親フォルダ: 別の場所にしていないプロジェクトと、既定の場所の共通のノート
  const plain = ctx.store.projects.create({ name: "親の下", repo_path: tempDir(), provider: "claude" });
  // フォルダを決めていないプロジェクトは数えない
  ctx.store.projects.create({ name: "まだ", repo_path: tempDir(), provider: "claude" });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: plain.id }, body: { path: "a.md", content: "a" } });
  await call("PUT", "/api/settings", { common_notes_dir: null });
  events.length = 0;
  assert.equal((await call("PUT", "/api/settings", { notes_dir: tempDir() })).status, 200);
  assert.deepEqual(notified().sort(), [plain.id, common.id].sort());
});
