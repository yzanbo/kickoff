// API のテスト: プロジェクトのゴミ箱・アーカイブ済みのチャットの整理・どのチャットも使っていない会話記録（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { TRASH_KEEP_MS} from "@shared/trash/types";
import { setup } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("プロジェクトのゴミ箱: 消すとチャットごと一覧から外れ、同じフォルダの登録は戻すよう断る。戻すとチャットも戻り、3 日たてば本当に消える", async () => {
  const { call, api, store, trashBin, trashClock, provider } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const repo = tempDir();
  const project = (await api("POST /api/projects/import", { body: { path: repo, name: "消す", provider: "claude" } })).body;
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "中のチャット", status: "completed" });
  store.events.add(chat.id, { type: "init", session_id: "sess-p" });
  const snippet = store.snippets.create({ project_id: project.id, label: "このプロジェクトだけ", text: "本文" });
  const noteFolder = store.projects.update(project.id, { note_folder: "消す" }).note_folder;

  const removed = await api("DELETE /api/projects/:projectId", { params: { projectId: project.id } });
  assert.equal(removed.status, 200);
  // ゴミ箱にある間は、そのプロジェクトだけの定型文も一覧から外れる
  assert.ok(!((await api("GET /api/snippets")).body as { id: number }[]).some((s) => s.id === snippet.id));
  // 新しいプロジェクトのノートのフォルダは、ゴミ箱のプロジェクトのフォルダ名と重ねない（戻したときに同じフォルダを指さないように）
  const other = (await api("POST /api/projects/import", { body: { path: tempDir(), name: "消す", provider: "claude", note_folder: "消す" } })).body;
  assert.notEqual(store.projects.get(other.id)?.note_folder, noteFolder);
  assert.equal(store.projects.get(project.id), undefined);
  assert.equal(store.chats.get(chat.id), undefined);
  assert.ok(!((await api("GET /api/projects")).body as { id: number }[]).some((p) => p.id === project.id));
  const listed = (await api("GET /api/trash/projects")).body;
  assert.deepEqual(listed.map((i) => [i.id, i.label]), [[removed.body.trash_id, "消す"]]);
  // 同じフォルダをもう一度取り込もうとしたら、ゴミ箱から戻すよう断る
  const again = await call("POST", "/api/projects/import", { path: repo, name: "もう一度", provider: "claude" });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /ゴミ箱/);

  await api("POST /api/trash/:itemId/restore", { params: { itemId: removed.body.trash_id }, body: {} });
  assert.equal(store.projects.get(project.id)?.name, "消す");
  assert.equal(store.chats.get(chat.id)?.title, "中のチャット");
  assert.ok(((await api("GET /api/snippets")).body as { id: number }[]).some((s) => s.id === snippet.id));

  await api("DELETE /api/projects/:projectId", { params: { projectId: project.id } });
  trashClock.now += TRASH_KEEP_MS + 60_000;
  await trashBin.sweep();
  assert.equal(store.projects.trashed().length, 0);
  assert.deepEqual(provider.discarded.at(-1)?.sessionIds, ["sess-p"]);
  assert.deepEqual((await api("GET /api/trash/projects")).body, []);
  // 本当に消えたら、同じフォルダをまた取り込める
  assert.equal((await api("POST /api/projects/import", { body: { path: repo, name: "新しく", provider: "claude" } })).status, 201);
});

test("アーカイブ済みのチャットの整理: 日数より前から動いていないものの数と、まとめてゴミ箱へ入れる（子チャットも一緒。新しいもの・アーカイブしていないものは残す）", async () => {
  const { call, api, project, store } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const make = (title: string, parent: number | null = null) => store.chats.create({ project_id: project.id, title, provider: "claude", status: "completed", parent_chat_id: parent });
  const old = make("古い");
  const child = make("古い子", old.id);
  const fresh = make("新しい");
  const kept = make("アーカイブしていない");
  store.chats.archive(old.id, true);
  store.chats.archive(fresh.id, true);
  const longAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
  store.db.prepare("UPDATE chats SET active_at = ? WHERE id IN (?, ?, ?)").run(longAgo, old.id, child.id, kept.id);

  const preview = await call("GET", "/api/archive-cleanup?days=30");
  assert.equal(preview.status, 200);
  assert.equal(preview.body.count, 2);
  assert.equal((await call("GET", "/api/archive-cleanup?days=0")).status, 400);

  const done = await api("POST /api/archive-cleanup", { body: { days: 30 } });
  assert.deepEqual(done.body, { trashed: 2 });
  assert.equal(store.chats.get(old.id), undefined);
  assert.equal(store.chats.get(child.id), undefined);
  assert.ok(store.chats.get(fresh.id));
  assert.ok(store.chats.get(kept.id));
  const list = (await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body;
  assert.deepEqual(list.map((i) => i.label), ["古い"]);
  assert.equal((await call("GET", "/api/archive-cleanup?days=30")).body.count, 0);
});

test("どのチャットも使っていない会話記録: 一覧（チャットが使うもの・Kickoff が覚えたものは除く）と、選んだものをゴミ箱へ（作業フォルダのプロジェクトに出る。外のものはプロジェクトのない一覧へ）", async () => {
  const { api, project, store, provider } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const dir = tempDir();
  const file = (id: string) => {
    const p = path.join(dir, `${id}.jsonl`);
    fs.writeFileSync(p, "{}\n");
    return p;
  };
  const ids = { used: "11111111-1111-4111-8111-111111111111", mine: "22222222-2222-4222-8222-222222222222", orphan: "33333333-3333-4333-8333-333333333333", outside: "44444444-4444-4444-8444-444444444444" };
  const chat = store.chats.create({ project_id: project.id, title: "c", provider: "claude", status: "completed" });
  store.chats.update(chat.id, { session_id: ids.mine });
  store.chats.update(chat.id, { session_id: ids.used });
  const info = (id: string, cwd: string) => ({ sessionId: id, file: file(id), size: 3, modifiedAt: new Date().toISOString(), cwd, firstPrompt: "前のチャット" });
  provider.sessionFiles = [info(ids.used, project.repo_path), info(ids.mine, project.repo_path), info(ids.orphan, project.repo_path), info(ids.outside, "/somewhere/else")];

  const list = (await api("GET /api/orphan-sessions")).body as { session_id: string; project_id: number | null; kickoff_ask: boolean }[];
  assert.ok(list.every((s) => s.kickoff_ask === false));
  assert.deepEqual(
    list.map((s) => [s.session_id, s.project_id]),
    [
      [ids.orphan, project.id],
      [ids.outside, null],
    ],
  );
  // Kickoff の 1 回だけの問い合わせ（OS の一時フォルダで動かしたもの）には印を付ける
  const askId = "55555555-5555-4555-8555-555555555555";
  provider.sessionFiles = [...provider.sessionFiles, info(askId, os.tmpdir())];
  const withAsk = (await api("GET /api/orphan-sessions")).body as { session_id: string; kickoff_ask: boolean }[];
  assert.equal(withAsk.find((s) => s.session_id === askId)?.kickoff_ask, true);
  provider.sessionFiles = provider.sessionFiles.filter((f) => f.sessionId !== askId);
  const done = await api("POST /api/orphan-sessions/trash", { body: { session_ids: [ids.orphan, ids.outside, ids.used] } });
  assert.deepEqual(done.body, { trashed: 2 });
  assert.equal(fs.existsSync(path.join(dir, `${ids.orphan}.jsonl`)), false);
  assert.ok(fs.existsSync(path.join(dir, `${ids.used}.jsonl`)));
  const inProject = (await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body;
  assert.deepEqual(inProject.map((i) => [i.kind, i.label]), [["session", "会話記録「前のチャット」"]]);
  const unassigned = (await api("GET /api/trash/unassigned")).body;
  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].origin, path.join(dir, `${ids.outside}.jsonl`));
});

