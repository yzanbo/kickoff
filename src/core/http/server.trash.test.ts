// API のテスト: Kickoff のゴミ箱（入れる・一覧・元に戻す・同じ名前があるとき・AI の kickoff-trash が置いたものの取り込み・3 日で消える）
// （共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { TRASH_KEEP_MS, TRASH_RESTORE_EXISTS, type BusEvent, type TrashItem } from "@shared/types";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { installTrashCommand, trashCommandEnv } from "../trash/command.js";
import { setup } from "../testing/testServer.js";
import { tempDir } from "../testing/tempDir.js";

const execFileAsync = promisify(execFile);

test("ゴミ箱: ファイルを入れると一覧に出て、元の場所に戻せる。入れた・戻したら知らせる", async () => {
  const { call, project, trashBin, bus } = setup();
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

  const list = (await call("GET", `/api/projects/${project.id}/trash`)).body as TrashItem[];
  assert.equal(list.length, 1);
  assert.equal(list[0].label, "a.txt");
  assert.equal(list[0].kind, "file");
  assert.equal(list[0].by_chat_id, null);
  assert.equal(Date.parse(list[0].expires_at) - Date.parse(list[0].trashed_at), TRASH_KEEP_MS);
  assert.equal("details" in list[0], false);

  // 途中のフォルダも消えていれば作って戻す
  fs.rmSync(path.join(dir, "sub"), { recursive: true });
  const restored = await call("POST", `/api/trash/${put.id}/restore`, {});
  assert.equal(restored.status, 200);
  assert.equal(restored.body.path, file);
  assert.equal(fs.readFileSync(file, "utf8"), "中身");
  assert.deepEqual((await call("GET", `/api/projects/${project.id}/trash`)).body, []);
  assert.equal((await call("POST", `/api/trash/${put.id}/restore`, {})).status, 404);
});

test("ゴミ箱: 元の場所に同じ名前があれば上書きせずに断り、rename なら「名前 2」で戻す", async () => {
  const { call, project, trashBin } = setup();
  const dir = tempDir();
  const file = path.join(dir, "a.txt");
  fs.writeFileSync(file, "古い");
  const put = await trashBin.putPath(file, { projectId: project.id });
  fs.writeFileSync(file, "新しい");

  const refused = await call("POST", `/api/trash/${put.id}/restore`, {});
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, TRASH_RESTORE_EXISTS);
  assert.equal(fs.readFileSync(file, "utf8"), "新しい");

  const renamed = await call("POST", `/api/trash/${put.id}/restore`, { rename: true });
  assert.equal(renamed.body.path, path.join(dir, "a 2.txt"));
  assert.equal(fs.readFileSync(path.join(dir, "a 2.txt"), "utf8"), "古い");
  assert.equal(fs.readFileSync(file, "utf8"), "新しい");
});

test("ゴミ箱: フォルダも入れて戻せ、大きさを数える", async () => {
  const { project, trashBin, store } = setup();
  const dir = path.join(tempDir(), "node_modules");
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
  fs.writeFileSync(path.join(dir, "x", "b.js"), "12345");
  const put = await trashBin.putPath(dir, { projectId: project.id });
  assert.equal(put.is_dir, true);
  for (let i = 0; i < 50 && store.trash.get(put.id)?.size == null; i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok((store.trash.get(put.id)?.size ?? 0) >= 5);
  await trashBin.restore(put.id);
  assert.equal(fs.readFileSync(path.join(dir, "x", "b.js"), "utf8"), "12345");
});

test("ゴミ箱: AI の kickoff-trash が置いたもの（origin・chat・at と item/）を、一覧を読むときに取り込む。途中で止まったものは古くなったら消す", async () => {
  const { call, project, trashBin, store, trashClock } = setup();
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

  const list = (await call("GET", `/api/projects/${project.id}/trash`)).body as TrashItem[];
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
  const { project, trashBin, store, trashClock } = setup();
  const file = path.join(tempDir(), "a.txt");
  fs.writeFileSync(file, "x");
  const put = await trashBin.putPath(file, { projectId: project.id });
  const purged: string[] = [];
  trashBin.register("chat", { purge: (item) => void purged.push(item.label) });
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
  const { call, project, trashBin, store } = setup();
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

  const ok = await run(["-rf", "dist", "--", "-odd.txt"]);
  assert.equal(ok.code, 0);
  assert.match(ok.stdout, /Kickoff のゴミ箱に入れました.*\[kickoff-trash:[0-9a-f-]{36}\]/);
  assert.equal(fs.existsSync(path.join(work, "dist")), false);
  assert.equal(fs.existsSync(path.join(work, "-odd.txt")), false);
  // ないもの・ホームは入れない（終わり値 1）
  const missing = await run(["nothing.txt"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /ありません/);

  const list = (await call("GET", `/api/projects/${project.id}/trash`)).body as TrashItem[];
  assert.deepEqual(list.map((i) => i.label).sort(), ["-odd.txt", "dist"]);
  const dist = list.find((i) => i.label === "dist")!;
  assert.equal(dist.is_dir, true);
  assert.equal(dist.by_chat_id, chat.id);
  assert.equal(dist.origin, path.join(fs.realpathSync(work), "dist"));
  await trashBin.restore(dist.id);
  assert.equal(fs.readFileSync(path.join(work, "dist", "x", "a.js"), "utf8"), "1");
});

test("ゴミ箱: AI が kickoff-trash でメモを消したら、メモのチャットも同じ行に入り、戻すと一緒に戻る", async () => {
  const { call, project, trashBin, store, runner } = setup();
  const base = `/api/projects/${project.id}`;
  await call("POST", `${base}/memos`, { path: "案.md", content: "# 案" });
  const memoDir = (await call("GET", `${base}/memos`)).body.dir as string;
  const memoChat = store.chats.create({ project_id: project.id, provider: "claude", title: "案のチャット", status: "completed", memo_path: "案.md" });
  const worker = store.chats.create({ project_id: project.id, provider: "claude", title: "片付け", status: "completed" });
  const bin = await installTrashCommand(tempDir());
  await execFileAsync("sh", ["-c", `kickoff-trash "${path.join(memoDir, "案.md")}"`], { env: { ...process.env, ...trashCommandEnv({ path: bin, dir: trashBin.dir }, worker.id) } });

  const list = (await call("GET", `${base}/trash`)).body as TrashItem[];
  assert.equal(list.length, 1);
  assert.equal(store.chats.get(memoChat.id), undefined);
  assert.equal(runner.isBusy(memoChat.id), false);
  await call("POST", `/api/trash/${list[0].id}/restore`, {});
  assert.equal(store.chats.get(memoChat.id)?.memo_path, "案.md");
  assert.ok(fs.existsSync(path.join(memoDir, "案.md")));
});

test("プロジェクトのゴミ箱: 消すとチャットごと一覧から外れ、同じフォルダの登録は戻すよう断る。戻すとチャットも戻り、3 日たてば本当に消える", async () => {
  const { call, store, trashBin, trashClock, provider } = setup();
  const repo = tempDir();
  const project = (await call("POST", "/api/projects/import", { path: repo, name: "消す", provider: "claude" })).body;
  const chat = store.chats.create({ project_id: project.id, provider: "claude", title: "中のチャット", status: "completed" });
  store.events.add(chat.id, { type: "init", session_id: "sess-p" });

  const removed = await call("DELETE", `/api/projects/${project.id}`);
  assert.equal(removed.status, 200);
  assert.equal(store.projects.get(project.id), undefined);
  assert.equal(store.chats.get(chat.id), undefined);
  assert.equal((await call("GET", `/api/projects/${project.id}`)).status, 404);
  const listed = (await call("GET", "/api/trash/projects")).body as TrashItem[];
  assert.deepEqual(listed.map((i) => [i.id, i.label]), [[removed.body.trash_id, "消す"]]);
  // 同じフォルダをもう一度取り込もうとしたら、ゴミ箱から戻すよう断る
  const again = await call("POST", "/api/projects/import", { path: repo, name: "もう一度", provider: "claude" });
  assert.equal(again.status, 409);
  assert.match(again.body.error, /ゴミ箱/);

  await call("POST", `/api/trash/${removed.body.trash_id}/restore`, {});
  assert.equal(store.projects.get(project.id)?.name, "消す");
  assert.equal(store.chats.get(chat.id)?.title, "中のチャット");

  await call("DELETE", `/api/projects/${project.id}`);
  trashClock.now += TRASH_KEEP_MS + 60_000;
  await trashBin.sweep();
  assert.equal(store.projects.trashed().length, 0);
  assert.deepEqual(provider.discarded.at(-1)?.sessionIds, ["sess-p"]);
  assert.deepEqual((await call("GET", "/api/trash/projects")).body, []);
  // 本当に消えたら、同じフォルダをまた取り込める
  assert.equal((await call("POST", "/api/projects/import", { path: repo, name: "新しく", provider: "claude" })).status, 201);
});
