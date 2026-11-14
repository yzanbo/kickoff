// API のテスト: 設定・プロジェクト（作成・変更・フォルダの変更・並べ替え・管理から外す）、プロジェクトの固定・アーカイブ・タグ・色（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { gitRepo } from "../testing/gitRepo.js";
import { TRASH_KEEP_MS } from "@shared/types";
import { AUTH, setup, until } from "../testing/testServer.js";
import { tempDir } from "../testing/tempDir.js";

test("設定・プロジェクトの API", async () => {
  const { app, call, project, store } = setup();
  assert.equal((await call("PUT", "/api/settings", { auto_archive_days: 3 })).body.auto_archive_days, 3);
  const invalid = await call("PUT", "/api/settings", { auto_archive_days: 999 });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "入力が正しくありません");
  assert.equal((await call("GET", "/api/settings")).body.auto_archive_days, 3);
  const status = await call("GET", "/api/status");
  assert.equal(status.body.version, "0.1.0");
  assert.deepEqual(status.body.agents, { running: 0 });
  // しないは null で保存する
  assert.equal((await call("PUT", "/api/settings", { auto_archive_days: null })).body.auto_archive_days, null);
  // 圧縮前指示: 前後の空白を除き、空は 400（なしは null）
  assert.equal((await call("PUT", "/api/settings", { pre_compact_prompt: " メモ " })).body.pre_compact_prompt, "メモ");
  assert.equal((await call("PUT", "/api/settings", { pre_compact_prompt: "  " })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { pre_compact_prompt: null })).body.pre_compact_prompt, null);
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { pre_compact_prompt: "書き残す" })).body.pre_compact_prompt, "書き残す");
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { pre_compact_prompt: null })).body.pre_compact_prompt, null);
  // 送るか（オン / オフ）: 初めはオンで、文と別に変えられる（オフでも文は残す）
  assert.equal(project.pre_compact_enabled, true);
  await call("PUT", "/api/settings", { post_compact_prompt: "読み直す" });
  const off = (await call("PUT", "/api/settings", { post_compact_enabled: false })).body;
  assert.deepEqual([off.post_compact_prompt, off.post_compact_enabled, off.pre_compact_enabled], ["読み直す", false, true]);
  const projectOff = (await call("PATCH", `/api/projects/${project.id}`, { pre_compact_prompt: "書き残す", pre_compact_enabled: false })).body;
  assert.deepEqual([projectOff.pre_compact_prompt, projectOff.pre_compact_enabled, projectOff.post_compact_enabled], ["書き残す", false, true]);
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { pre_compact_enabled: true })).body.pre_compact_enabled, true);
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { pre_compact_enabled: "no" })).status, 400);
  await call("PUT", "/api/settings", { post_compact_prompt: null, post_compact_enabled: true });
  await call("PATCH", `/api/projects/${project.id}`, { pre_compact_prompt: null });

  assert.deepEqual(
    (await call("GET", "/api/projects")).body.map((p: { id: number }) => p.id),
    [project.id],
  );
  assert.equal((await call("GET", `/api/projects/${project.id}`)).body.name, "p");
  assert.deepEqual(await call("GET", "/api/projects/999"), { status: 404, body: { error: "プロジェクトが見つかりません" } });

  // 以前の書き込み範囲（write_scopes）は受け付けず（無視する）、返しもしない
  const patched = await call("PATCH", `/api/projects/${project.id}`, { name: "q", write_scopes: { requirements: ["docs"] } });
  assert.equal(patched.body.name, "q");
  assert.equal(patched.body.write_scopes, undefined);
  const missing = await call("PATCH", `/api/projects/${project.id}`, { reference_paths: [{ path: "/no/such/kickoff/path" }] });
  assert.deepEqual(missing, { status: 400, body: { error: "見つかりません: /no/such/kickoff/path" } });
  const refs = await call("PATCH", `/api/projects/${project.id}`, { reference_paths: [{ path: project.repo_path }, { path: project.repo_path }] });
  assert.deepEqual(refs.body.reference_paths, [{ path: project.repo_path, kind: "folder" }]);

  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  // サイドバーの並び順は position で持つ。並べ替えは、並べたあとの一覧を返す（グループの並べ替えと同じ）
  const ordered = (await call("PUT", "/api/projects/order", { ids: [other.id, project.id] })).body;
  assert.deepEqual(ordered.map((p: { id: number }) => p.id), [other.id, project.id]);
  const positions = new Map((await call("GET", "/api/projects")).body.map((p: { id: number; position: number }) => [p.id, p.position]));
  assert.deepEqual([positions.get(other.id), positions.get(project.id)], [1, 2]);
  // 管理から外す = Kickoff のゴミ箱へ（入れたゴミ箱の ID を返す）
  assert.equal((await call("DELETE", `/api/projects/${other.id}`)).status, 200);
  assert.equal(store.projects.get(other.id), undefined);

  const inspected = await call("GET", `/api/workspace/inspect?path=${encodeURIComponent(project.repo_path)}`);
  assert.equal(inspected.status, 200);
  assert.ok("registered_project_id" in inspected.body);
  // フォルダの指定がなければ 400（起動したフォルダを点検しない）
  assert.equal((await call("GET", "/api/workspace/inspect")).status, 400);
  assert.equal((await call("GET", "/api/workspace/inspect?path=%20")).status, 400);

  // タスク・成果物の API はなくした
  for (const url of [`/api/projects/${project.id}/tasks`, `/api/projects/${project.id}/artifacts`]) {
    assert.equal((await app.request(url, { headers: AUTH })).status, 404, url);
  }
  // 以前の設定（テストのコマンド・デプロイの手順・自動コミット）は受け付けず（無視する）、返しもしない
  const legacy = (await call("PATCH", `/api/projects/${project.id}`, { test_command: "npm test", deploy_instructions: "x", auto_commit: false })).body;
  for (const key of ["test_command", "deploy_instructions", "auto_commit"]) assert.equal(key in legacy, false, key);
});

test("新しいプロジェクト: フォルダを Git のリポジトリとして作り、説明（description。取り込み・編集と同じキー）を README の「アイデア」にも書く", async () => {
  const { call, store } = setup();
  const parent = tempDir();
  const created = await call("POST", "/api/projects", { name: "Todo", description: "やることを管理したい", parent_dir: parent, folder_name: "todo" });
  assert.equal(created.status, 201);
  assert.equal(created.body.description, "やることを管理したい");
  assert.match(fs.readFileSync(path.join(created.body.repo_path, "README.md"), "utf8"), /## アイデア\n\nやることを管理したい/);
  // 作った場所を、次の新しいプロジェクトの保存先の既定にする
  assert.equal(store.settings.get().projects_dir, parent);
  // 同じ名前の空でないフォルダには作らない（409）
  assert.equal((await call("POST", "/api/projects", { name: "Todo", parent_dir: parent, folder_name: "todo" })).status, 409);
  // ほかのプロジェクトとして取り込んだ空のフォルダにも作らない（同じフォルダに 2 つ目のプロジェクトを作らない）
  const empty = path.join(parent, "empty");
  fs.mkdirSync(empty);
  assert.equal((await call("POST", "/api/projects/import", { path: empty, name: "Empty" })).status, 201);
  const dup = await call("POST", "/api/projects", { name: "Dup", parent_dir: parent, folder_name: "empty" });
  assert.deepEqual([dup.status, dup.body.error], [409, "このフォルダは「Empty」として登録済みです"]);
  assert.equal(fs.existsSync(path.join(empty, "README.md")), false);
});

test("新しいプロジェクト・取り込みのメモの保存先: memo_folder は使える名前にして重なれば「名前-2」、memo_path は別の場所、省けば決めない", async () => {
  const { call, store } = setup();
  const parent = tempDir();
  const first = (await call("POST", "/api/projects", { name: "A", parent_dir: parent, folder_name: "a", memo_folder: "メモ/a" })).body;
  assert.deepEqual([first.memo_folder, first.memo_path], ["メモ-a", null]);
  const folder = tempDir();
  const imported = (await call("POST", "/api/projects/import", { path: folder, name: "B", memo_folder: "メモ-a" })).body;
  assert.equal(imported.memo_folder, "メモ-a-2");
  const memoDir = tempDir();
  const elsewhere = (await call("POST", "/api/projects", { name: "C", parent_dir: parent, folder_name: "c", memo_folder: "x", memo_path: memoDir })).body;
  assert.deepEqual([elsewhere.memo_folder, elsewhere.memo_path], [null, memoDir]);
  const plain = (await call("POST", "/api/projects", { name: "D", parent_dir: parent, folder_name: "d" })).body;
  assert.deepEqual([plain.memo_folder, plain.memo_path], [null, null]);
  // 別の場所は絶対パスだけ
  assert.equal((await call("POST", "/api/projects", { name: "E", parent_dir: parent, folder_name: "e", memo_path: "rel/dir" })).status, 400);
  assert.equal(store.projects.list().length, 5);
});

test("プロジェクトを上に固定する・しまう（アーカイブ）・戻す", async () => {
  const { call, project } = setup();
  const pinned = (await call("PATCH", `/api/projects/${project.id}`, { pinned: true })).body;
  assert.equal(pinned.pinned, true);
  const archived = (await call("PATCH", `/api/projects/${project.id}`, { archived: true })).body;
  assert.ok(archived.archived_at);
  // しまったままもう一度しまっても、しまった日時は変わらない
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { archived: true })).body.archived_at, archived.archived_at);
  const restored = (await call("PATCH", `/api/projects/${project.id}`, { archived: false, pinned: false })).body;
  assert.equal(restored.archived_at, null);
  assert.equal(restored.pinned, false);
});

test("プロジェクトのタグ: 前後の空白と重複を除いて置き換える。長さ・数の上限を超えたら 400", async () => {
  const { call, project, store } = setup();
  assert.deepEqual(project.tags, []);
  const tagged = (await call("PATCH", `/api/projects/${project.id}`, { tags: [" 仕事 ", "クライアント A", "仕事"] })).body;
  assert.deepEqual(tagged.tags, ["仕事", "クライアント A"]);
  assert.deepEqual((await call("GET", "/api/projects")).body[0].tags, ["仕事", "クライアント A"]);
  // ほかの項目だけを変えても、タグはそのまま
  assert.deepEqual((await call("PATCH", `/api/projects/${project.id}`, { name: "q" })).body.tags, ["仕事", "クライアント A"]);
  for (const tags of [["x".repeat(31)], ["  "], Array.from({ length: 21 }, (_, i) => `t${i}`), "仕事"]) {
    assert.equal((await call("PATCH", `/api/projects/${project.id}`, { tags })).status, 400, JSON.stringify(tags));
  }
  // 重複を除いて 20 個なら受け付ける
  const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
  assert.deepEqual((await call("PATCH", `/api/projects/${project.id}`, { tags: [...many, "t0"] })).body.tags, many);
  assert.deepEqual((await call("PATCH", `/api/projects/${project.id}`, { tags: [] })).body.tags, []);
  assert.deepEqual(store.projects.get(project.id)?.tags, []);
});

test("プロジェクトの色: 一覧の色だけに変えられる", async () => {
  const { call, project } = setup();
  assert.ok(typeof project.hue === "number");
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { hue: 222 })).body.hue, 222);
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { hue: 100 })).status, 400);
});

test("プロジェクトのフォルダを変える: 取り込みと同じ決まりで確かめ、ほかのプロジェクトのフォルダ・作業中のチャットがあれば 409", async () => {
  const { call, project, store, runner, provider } = setup();
  const url = `/api/projects/${project.id}/repo-path`;
  const { dir: moved } = gitRepo({ files: { "a.txt": "a" } });
  const real = fs.realpathSync(moved);
  // 見つからないは 400
  assert.equal((await call("PUT", url, { path: "/no/such/kickoff/folder" })).status, 400);
  const plain = tempDir();
  // ほかのプロジェクトのフォルダは 409（登録したパスがシンボリックリンクを含んでいても、実体で比べる。macOS の一時フォルダは /var → /private/var）
  const other = store.projects.create({ name: "o", repo_path: moved, provider: "claude" });
  assert.equal((await call("PUT", url, { path: moved })).status, 409);
  store.projects.delete(other.id);
  // 作業中のチャットがあれば 409（フォルダは変えない）
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("PUT", url, { path: moved })).status, 409);
  assert.equal(store.projects.get(project.id)?.repo_path, project.repo_path);
  release();
  await until(() => !runner.isBusy(chatId));
  // 変えると、チャットはそのまま引き継ぐ（実体のパスにそろえる）
  const changed = await call("PUT", url, { path: moved });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.repo_path, real);
  assert.equal(store.chats.get(chatId)?.project_id, project.id);
  // 次の指示から新しいフォルダで動き、AI への説明のプロジェクトフォルダも新しい場所になる（指示を送るたびに作り直す）
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "2" })).status < 300, true);
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  assert.equal(provider.lastCwd, real);
  assert.ok(provider.lastSystemPrompt.includes(`- プロジェクトフォルダ: ${real}`));
  // git でないフォルダは、初期化に同意すれば最初のコミットを作って変え、同意しなければ git で管理しないまま変える
  const plain2 = tempDir();
  assert.equal((await call("PUT", url, { path: plain2 })).body.repo_path, fs.realpathSync(plain2));
  assert.equal(fs.existsSync(path.join(plain2, ".git")), false);
  const initialized = await call("PUT", url, { path: plain, init_git: true });
  assert.equal(initialized.body.repo_path, fs.realpathSync(plain));
  assert.ok(fs.existsSync(path.join(plain, ".git")));
  // いまと同じフォルダ（シンボリックリンクを含むパスで指しても）はそのまま返す
  assert.equal((await call("PUT", url, { path: plain })).body.repo_path, fs.realpathSync(plain));
  // 取り込み・点検も実体で比べる
  assert.equal((await call("GET", `/api/workspace/inspect?path=${encodeURIComponent(plain)}`)).body.registered_project_id, project.id);
  assert.equal((await call("POST", "/api/projects/import", { path: plain, name: "dup" })).status, 409);
});

test("git で管理しない新しいプロジェクト・取り込み、あとから git の管理を始める（もう管理していれば 409）", async () => {
  const { call } = setup();
  const parent = tempDir();
  const created = await call("POST", "/api/projects", { name: "Plain", parent_dir: parent, folder_name: "plain", init_git: false });
  assert.equal(created.status, 201);
  assert.equal(fs.existsSync(path.join(created.body.repo_path, ".git")), false);
  assert.deepEqual((await call("GET", `/api/projects/${created.body.id}/git/status`)).body, { repo: false });
  // 取り込みも、同意しなければ git で管理しないまま
  const folder = tempDir();
  fs.writeFileSync(path.join(folder, "a.txt"), "a");
  const imported = await call("POST", "/api/projects/import", { path: folder, name: "Imported" });
  assert.equal(imported.status, 201);
  assert.equal(fs.existsSync(path.join(folder, ".git")), false);
  // git の管理を始める
  assert.equal((await call("POST", `/api/projects/${imported.body.id}/git/init`)).status, 204);
  const status = (await call("GET", `/api/projects/${imported.body.id}/git/status`)).body;
  assert.deepEqual([status.repo, status.branch, status.unstaged.length], [true, "main", 0]);
  assert.equal((await call("POST", `/api/projects/${imported.body.id}/git/init`)).status, 409);
  // 省くと初期化する（今までどおり）
  const withGit = await call("POST", "/api/projects", { name: "Git", parent_dir: parent, folder_name: "with-git" });
  assert.equal(fs.existsSync(path.join(withGit.body.repo_path, ".git")), true);
});

test("プロジェクトを削除するとゴミ箱に入り、3 日たって本当に消すとき、中のチャットのエージェントの会話記録も消すよう頼む（作業中のチャットがあれば 409 で消さない）", async () => {
  const { call, project, store, runner, provider, trashBin, trashClock } = setup();
  const release = provider.hold();
  const chatId: number = (await call("POST", `/api/projects/${project.id}/chats`, { text: "1" })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await call("DELETE", `/api/projects/${project.id}`)).status, 409);
  assert.ok(store.projects.get(project.id));
  release();
  await until(() => store.chats.get(chatId)?.status === "completed" && !runner.isBusy(chatId));
  const result = store.events.list(chatId).find((e) => e.type === "result")!;
  // 分岐したチャット（アーカイブ済み）のセッションも一緒に
  const forkedId: number = (await call("POST", `/api/chats/${chatId}/fork`, { event_id: result.id })).body.id;
  store.chats.archive(forkedId, true);
  assert.equal((await call("DELETE", `/api/projects/${project.id}`)).status, 200);
  assert.equal(store.chats.get(chatId), undefined);
  assert.equal(provider.discarded.length, 0);
  trashClock.now += TRASH_KEEP_MS + 60_000;
  await trashBin.sweep();
  assert.equal(provider.discarded.length, 1);
  assert.deepEqual([...provider.discarded[0].sessionIds].sort(), ["fork-1", "s1"]);
});
