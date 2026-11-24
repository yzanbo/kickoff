// API のテスト: Kickoff のゴミ箱（入れる・一覧・元に戻す・同じ名前があるとき・AI の kickoff-trash が置いたものの取り込み・3 日で消える・待たずに完全に消す）（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { TRASH_KEEP_MS, TRASH_RESTORE_EXISTS} from "@shared/trash/types";
import type { BusEvent } from "@shared/foundation/contract";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { installTrashCommand, trashCommandEnv } from "@/features/trash/core/command";
import { trashMarksIn } from "@shared/trash/marks";
import { setup } from "@/app/core/testing/testServer";
import { until } from "@/app/core/testing/testCore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { deferred } from "@shared/foundation/testing/async";

const execFileAsync = promisify(execFile);

test("ゴミ箱: ファイルを入れると一覧に出て、元の場所に戻せる。入れた・戻したら知らせる", async () => {
  const { api, project, trashBin, bus } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const dir = tempDir();
  const file = path.join(dir, "sub", "a.txt");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "中身");

  const put = await trashBin.putPath(file, { projectId: project.id });
  assert.equal(fs.existsSync(file), false);
  assert.equal(put.origin, file);
  assert.ok(events.some((e) => e.type === "trash" && e.project_id === project.id));

  const list = (await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body;
  assert.equal(list.length, 1);
  assert.equal(list[0].label, "a.txt");
  assert.equal((await api("GET /api/trash/:itemId", { params: { itemId: put.id } })).body.label, "a.txt");
  assert.equal(list[0].kind, "file");
  assert.equal(list[0].by_chat_id, null);
  assert.equal(Date.parse(list[0].expires_at) - Date.parse(list[0].trashed_at), TRASH_KEEP_MS);
  assert.equal("details" in list[0], false);

  // 途中のフォルダも消えていれば作って戻す
  fs.rmSync(path.join(dir, "sub"), { recursive: true });
  const restored = await api("POST /api/trash/:itemId/restore", { params: { itemId: put.id }, body: {} });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.path, file);
  assert.equal(fs.readFileSync(file, "utf8"), "中身");
  assert.deepEqual((await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body, []);
  assert.equal((await api("POST /api/trash/:itemId/restore", { params: { itemId: put.id }, body: {} })).status, 404);
  assert.equal((await api("GET /api/trash/:itemId", { params: { itemId: put.id } })).status, 404);
});

test("ゴミ箱: 元の場所に同じ名前があれば上書きせずに断り、rename なら「名前 2」で戻す", async () => {
  const { call, api, project, trashBin } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const dir = tempDir();
  const file = path.join(dir, "a.txt");
  fs.writeFileSync(file, "古い");
  const put = await trashBin.putPath(file, { projectId: project.id });
  fs.writeFileSync(file, "新しい");

  const refused = await call("POST", `/api/trash/${put.id}/restore`, {});
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, TRASH_RESTORE_EXISTS);
  assert.equal(fs.readFileSync(file, "utf8"), "新しい");

  const renamed = await api("POST /api/trash/:itemId/restore", { params: { itemId: put.id }, body: { rename: true } });
  assert.equal(renamed.body.path, path.join(dir, "a 2.txt"));
  assert.equal(fs.readFileSync(path.join(dir, "a 2.txt"), "utf8"), "古い");
  assert.equal(fs.readFileSync(file, "utf8"), "新しい");
});

test("ゴミ箱: フォルダも入れて戻せ、大きさを数える", async () => {
  const { project, trashBin, store } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const dir = path.join(tempDir(), "node_modules");
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "b.js"), "12345");
  const put = await trashBin.putPath(dir, { projectId: project.id });
  assert.equal(put.is_dir, true);
  await until(() => store.trash.get(put.id)?.size != null, 500);
  // 中のファイルの大きさの合計（フォルダの項目の表の大きさは数えない）
  assert.equal(store.trash.get(put.id)?.size, 5);
  await trashBin.restore(put.id);
  assert.equal(fs.readFileSync(path.join(dir, "x", "b.js"), "utf8"), "12345");
});

test("ゴミ箱: AI の kickoff-trash が置いたもの（origin・chat・at と item/）を、一覧を読むときに取り込む。途中で止まったものは古くなったら消す", async () => {
  const { api, project, trashBin, store, trashClock } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const chat = store.chats.create({ project_id: project.id, title: "掃除", provider: "claude", status: "completed" });
  const id = "0b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
  const folder = path.join(trashBin.dir, id);
  fs.mkdirSync(path.join(folder, "item"), { recursive: true });
  fs.writeFileSync(path.join(folder, "item", "old.ts"), "x");
  fs.writeFileSync(path.join(folder, "origin"), path.join(project.repo_path, "src", "old.ts"));
  fs.writeFileSync(path.join(folder, "chat"), String(chat.id));
  fs.writeFileSync(path.join(folder, "at"), "2026-11-14T00:00:00Z");
  // 中身のない（途中で止まった）もの
  const broken = "1b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
  fs.mkdirSync(path.join(trashBin.dir, broken, "item"), { recursive: true });

  const list = (await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, id);
  assert.equal(list[0].by_chat_id, chat.id);
  assert.equal(list[0].by_chat_title, "掃除");
  assert.equal(list[0].trashed_at, "2026-11-14T00:00:00.000Z");
  assert.ok(fs.existsSync(path.join(trashBin.dir, broken)));

  trashClock.now += 2 * 60 * 60 * 1000;
  await trashBin.importInbox();
  assert.equal(fs.existsSync(path.join(trashBin.dir, broken)), false);

  // 戻すと元の場所（途中のフォルダも作る）
  await trashBin.restore(id);
  assert.equal(fs.readFileSync(path.join(project.repo_path, "src", "old.ts"), "utf8"), "x");
});

test("ゴミ箱: 3 日たったものは片付けで本当に消え、種類ごとの扱いも呼ぶ", async () => {
  const { project, trashBin, store, trashClock } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const file = path.join(tempDir(), "a.txt");
  fs.writeFileSync(file, "x");
  const put = await trashBin.putPath(file, { projectId: project.id });
  const purged: string[] = [];
  trashBin.registerKind({ kind: "chat", purge: (item) => void purged.push(item.label) });
  const record = trashBin.addRecord({ project_id: project.id, kind: "chat", label: "古いチャット", chat_id: 1 });

  trashClock.now += TRASH_KEEP_MS - 60_000;
  await trashBin.sweep();
  assert.ok(store.trash.get(put.id));

  trashClock.now += 2 * 60_000;
  await trashBin.sweep();
  assert.equal(store.trash.get(put.id), null);
  assert.equal(store.trash.get(record.id), null);
  assert.equal(fs.existsSync(path.join(trashBin.dir, put.id)), false);
  assert.deepEqual(purged, ["古いチャット"]);
});

test("ゴミ箱: kickoff-trash（Kickoff が置く sh）で入れたものが、消したチャットのプロジェクトのゴミ箱に出て、元に戻せる", async () => {
  const { api, project, trashBin, store } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const chat = store.chats.create({ project_id: project.id, title: "片付け", provider: "claude", status: "completed" });
  const bin = await installTrashCommand(tempDir());
  // 中身が同じなら書き直さない
  assert.equal(await installTrashCommand(path.dirname(bin)), bin);
  const work = tempDir();
  fs.mkdirSync(path.join(work, "dist", "x"), { recursive: true });
  fs.writeFileSync(path.join(work, "dist", "x", "a.js"), "1");
  fs.writeFileSync(path.join(work, "-odd.txt"), "2");
  const env = { ...process.env, ...trashCommandEnv({ path: bin, dir: trashBin.dir }, chat.id) };
  const run = (args: string[]) => execFileAsync("sh", ["-c", `kickoff-trash ${args.join(" ")}`], { cwd: work, env }).then(
    (r) => ({ code: 0, ...r }),
    (e: { code: number; stdout: string; stderr: string }) => e,
  );

  // 一覧を読む前でも、出力の印の ID で戻せる（会話の中の「戻す」。取り込んでから戻す）
  fs.writeFileSync(path.join(work, "early.txt"), "0");
  const early = await run(["early.txt"]);
  const [mark] = trashMarksIn(early.stdout);
  assert.equal(mark.origin, path.join(fs.realpathSync(work), "early.txt"));
  const restored = await api("POST /api/trash/:itemId/restore", { params: { itemId: mark.id }, body: {} });
  assert.equal(restored.status, 200);
  assert.equal(fs.readFileSync(path.join(work, "early.txt"), "utf8"), "0");
  fs.rmSync(path.join(work, "early.txt"));

  const ok = await run(["-rf", "dist", "--", "-odd.txt"]);
  assert.equal(ok.code, 0);
  assert.match(ok.stdout, /Kickoff のゴミ箱に入れました.*\[kickoff-trash:[0-9a-f-]{36}\]/);
  assert.equal(trashMarksIn(ok.stdout).length, 2);
  assert.equal(fs.existsSync(path.join(work, "dist")), false);
  assert.equal(fs.existsSync(path.join(work, "-odd.txt")), false);
  // ないもの・ホームは入れない（終わり値 1）
  const missing = await run(["nothing.txt"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /ありません/);

  const list = (await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body;
  assert.deepEqual(list.map((i) => i.label).sort(), ["-odd.txt", "dist"]);
  const dist = list.find((i) => i.label === "dist")!;
  assert.equal(dist.is_dir, true);
  assert.equal(dist.by_chat_id, chat.id);
  assert.equal(dist.origin, path.join(fs.realpathSync(work), "dist"));
  await trashBin.restore(dist.id);
  assert.equal(fs.readFileSync(path.join(work, "dist", "x", "a.js"), "utf8"), "1");
});

test("ゴミ箱: AI が kickoff-trash でノートを消したら、ノートのチャットも同じ行に入り、戻すと一緒に戻る", async () => {
  const { api, project, trashBin, store, runner } = setup({ features: ["trash", "chat", "projects", "notes"] });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "案.md", content: "# 案" } });
  const noteDir = (await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body.dir as string;
  const noteChat = store.chats.create({ project_id: project.id, provider: "claude", title: "案のチャット", status: "completed", note_path: "案.md" });
  const worker = store.chats.create({ project_id: project.id, provider: "claude", title: "片付け", status: "completed" });
  const bin = await installTrashCommand(tempDir());
  await execFileAsync("sh", ["-c", `kickoff-trash "${path.join(noteDir, "案.md")}"`], { env: { ...process.env, ...trashCommandEnv({ path: bin, dir: trashBin.dir }, worker.id) } });

  const list = (await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body;
  assert.equal(list.length, 1);
  assert.equal(store.chats.get(noteChat.id), undefined);
  assert.equal(runner.isBusy(noteChat.id), false);
  await api("POST /api/trash/:itemId/restore", { params: { itemId: list[0].id }, body: {} });
  assert.equal(store.chats.get(noteChat.id)?.note_path, "案.md");
  assert.ok(fs.existsSync(path.join(noteDir, "案.md")));
});

test("ゴミ箱: 一緒に入れるもの（会話記録と同じ名前のフォルダ）も置き場へ移し、大きさに数え、戻すと元の場所へ戻る", async () => {
  const { api, project, trashBin, store } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const dir = tempDir();
  const file = path.join(dir, "s.jsonl");
  const companion = path.join(dir, "s");
  fs.writeFileSync(file, "12345");
  fs.mkdirSync(path.join(companion, "subagents"), { recursive: true });
  fs.writeFileSync(path.join(companion, "subagents", "a.jsonl"), "1234567890");
  const put = await trashBin.putPath(file, { projectId: project.id, kind: "session", companions: [companion, path.join(dir, "none")] });
  assert.equal(fs.existsSync(companion), false);
  await until(() => (store.trash.get(put.id)?.size ?? 0) >= 15);
  assert.equal((await api("POST /api/trash/:itemId/restore", { params: { itemId: put.id }, body: {} })).status, 200);
  assert.equal(fs.readFileSync(path.join(companion, "subagents", "a.jsonl"), "utf8"), "1234567890");
  assert.equal(fs.readFileSync(file, "utf8"), "12345");
});

test("ゴミ箱: 片付けの途中に頼んだ片付けは、終わるのを待ってからもう一度流す（頼んだときに 3 日たっていたものを残さない）", async () => {
  const { project, trashBin, store, trashClock } = setup({ features: ["trash", "chat", "projects", "notes"] });
  // A は 1 つ目の片付けで消える古いもの。消している途中で止めておく
  const purging = deferred<void>();
  const held = deferred<void>();
  trashBin.registerKind({
    kind: "chat",
    purge: async () => {
      purging.resolve();
      await held.promise;
    },
  });
  trashBin.addRecord({ project_id: project.id, kind: "chat", label: "古いチャット", chat_id: 1 });
  trashClock.now += TRASH_KEEP_MS + 60_000;
  // B は 1 つ目の片付けが数えた時点ではまだ 3 日たっていない（入れた時刻をいまの時計にする）
  const b = trashBin.addRecord({ project_id: project.id, kind: "chat", label: "新しいチャット", chat_id: 2, trashed_at: new Date(trashClock.now).toISOString() });
  const running = trashBin.sweep();
  await purging.promise;
  // 1 つ目が数え終えてから時計を進めて頼む
  trashClock.now += TRASH_KEEP_MS + 60_000;
  const asked = trashBin.sweep();
  const askedAgain = trashBin.sweep();
  held.resolve();
  await Promise.all([running, asked, askedAgain]);
  assert.equal(store.trash.get(b.id), null);
});

test("ゴミ箱: 入れた時刻は片付けと同じ時計で付ける（本物の時計とずれていても、入れてから 3 日たてば消える）", async () => {
  const { project, trashBin, store, trashClock } = setup({ features: ["trash", "chat", "projects", "notes"] });
  // 片付けの時計を本物より 10 分遅らせる（テストの準備から入れるまでに時間がかかったのと同じ）
  trashClock.now = Date.now() - 10 * 60_000;
  const file = path.join(tempDir(), "a.txt");
  fs.writeFileSync(file, "x");
  const put = await trashBin.putPath(file, { projectId: project.id });
  const record = trashBin.addRecord({ project_id: project.id, kind: "chat", label: "チャット", chat_id: 1 });
  assert.equal(put.trashed_at, new Date(trashClock.now).toISOString());
  trashClock.now += TRASH_KEEP_MS + 1000;
  await trashBin.sweep();
  assert.equal(store.trash.get(put.id), null);
  assert.equal(store.trash.get(record.id), null);
});

test("ゴミ箱: 3 日を待たずに 1 件を完全に消せる（置き場の中身も消え、チャットは会話記録ごと消える。もうないものは 404）", async () => {
  const { api, project, trashBin, store, provider } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const file = path.join(tempDir(), "a.txt");
  fs.writeFileSync(file, "x");
  const put = await trashBin.putPath(file, { projectId: project.id });

  const removed = await api("DELETE /api/trash/:itemId", { params: { itemId: put.id } });
  assert.equal(removed.status, 204);
  assert.equal(store.trash.get(put.id), null);
  assert.equal(fs.existsSync(path.join(trashBin.dir, put.id)), false);
  assert.equal(fs.existsSync(file), false);
  assert.equal((await api("DELETE /api/trash/:itemId", { params: { itemId: put.id } })).status, 404);
  assert.equal((await api("POST /api/trash/:itemId/restore", { params: { itemId: put.id }, body: {} })).status, 404);

  // チャット: 種類ごとの扱い（会話記録のファイル・行を消す）も流す
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "消すチャット", status: "completed" });
  store.events.add(chat.id, { type: "init", session_id: "sess-now" });
  const trashed = (await api("DELETE /api/chats/:chatId", { params: { chatId: chat.id } })).body as { trash_id: string };
  assert.equal((await api("DELETE /api/trash/:itemId", { params: { itemId: trashed.trash_id } })).status, 204);
  assert.equal(store.trash.get(trashed.trash_id), null);
  assert.deepEqual(provider.discarded.at(-1)?.sessionIds, ["sess-now"]);
  assert.deepEqual((await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body, []);
});

test("ゴミ箱: まとめて完全に消す（渡した ID だけ。もうないものは飛ばして消した数を返す）", async () => {
  const { api, project, trashBin, store } = setup({ features: ["trash", "chat", "projects", "notes"] });
  const dir = tempDir();
  const puts = [];
  for (const name of ["a.txt", "b.txt", "c.txt"]) {
    fs.writeFileSync(path.join(dir, name), name);
    puts.push(await trashBin.putPath(path.join(dir, name), { projectId: project.id }));
  }
  const [a, b, c] = puts;
  // b は先に戻しておく（画面の一覧が古かったとき）
  await api("POST /api/trash/:itemId/restore", { params: { itemId: b.id }, body: {} });

  const res = await api("POST /api/trash/purge", { body: { ids: [a.id, b.id, a.id] } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { purged: 1 });
  assert.equal(store.trash.get(a.id), null);
  assert.equal(fs.existsSync(path.join(trashBin.dir, a.id)), false);
  // 渡していない c は残る
  assert.ok(store.trash.get(c.id));
  assert.deepEqual(((await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body).map((i) => i.id), [c.id]);
  // 形の違う本文は 400
  assert.equal((await api("POST /api/trash/purge", { body: { ids: [] } })).status, 400);
  assert.equal((await api("POST /api/trash/purge", { body: { ids: ["../x"] } })).status, 400);
});

test("ゴミ箱: 片付けと「完全に消す」が重なっても、種類ごとの扱いは 1 回だけ流す", async () => {
  const { project, trashBin, store, trashClock } = setup({ features: ["trash", "chat", "projects", "notes"] });
  let calls = 0;
  const held = deferred<void>();
  trashBin.registerKind({
    kind: "chat",
    purge: async () => {
      calls++;
      await held.promise;
    },
  });
  const record = trashBin.addRecord({ project_id: project.id, kind: "chat", label: "古いチャット", chat_id: 1 });
  trashClock.now += TRASH_KEEP_MS + 60_000;
  const sweeping = trashBin.sweep();
  await until(() => calls === 1);
  const now = trashBin.purgeNow([record.id]);
  held.resolve();
  await Promise.all([sweeping, now]);
  assert.equal(calls, 1);
  assert.equal(store.trash.get(record.id), null);
});
