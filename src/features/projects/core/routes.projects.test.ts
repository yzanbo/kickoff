// API のテスト: 設定・プロジェクト（作成・変更・フォルダの変更・並べ替え・管理から外す）、プロジェクトの固定・アーカイブ・タグ・色（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { TRASH_KEEP_MS } from "@shared/trash/types";
import type { BusEvent } from "@shared/foundation/contract";
import { setup, until } from "@/app/core/testing/testServer";
import { tempDir } from "@/foundation/core/testing/tempDir";

test("設定: リンクの開き先（既定は Kickoff のブラウザ）と、確認を省くドメイン（小文字にそろえ、重ねない・使えない名前は 400）", async () => {
  const { call } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const initial = (await call("GET", "/api/settings")).body;
  assert.equal(initial.link_open_in, "kickoff");
  assert.deepEqual(initial.trusted_link_domains, []);
  const updated = await call("PUT", "/api/settings", { link_open_in: "browser", trusted_link_domains: ["Example.com", "example.com", "docs.example.com"] });
  assert.equal(updated.body.link_open_in, "browser");
  assert.deepEqual(updated.body.trusted_link_domains, ["example.com", "docs.example.com"]);
  assert.equal((await call("PUT", "/api/settings", { trusted_link_domains: ["a b"] })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { link_open_in: "safari" })).status, 400);
});

test("設定・プロジェクトの API", async () => {
  const { call, api, project, store } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  assert.equal((await call("PUT", "/api/settings", { auto_archive_days: 3 })).body.auto_archive_days, 3);
  const invalid = await call("PUT", "/api/settings", { auto_archive_days: 999 });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "入力が正しくありません");
  assert.equal((await call("GET", "/api/settings")).body.auto_archive_days, 3);
  const status = await api("GET /api/status");
  assert.equal(status.body.version, "0.1.0");
  assert.deepEqual(status.body.agents, { running: 0 });
  // しないは null で保存する
  assert.equal((await call("PUT", "/api/settings", { auto_archive_days: null })).body.auto_archive_days, null);
  // 圧縮前指示: 前後の空白を除き、空は 400（なしは null）
  assert.equal((await call("PUT", "/api/settings", { pre_compact_prompt: " ノート " })).body.pre_compact_prompt, "ノート");
  assert.equal((await call("PUT", "/api/settings", { pre_compact_prompt: "  " })).status, 400);
  assert.equal((await call("PUT", "/api/settings", { pre_compact_prompt: null })).body.pre_compact_prompt, null);
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pre_compact_prompt: "書き残す" } })).body.pre_compact_prompt, "書き残す");
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pre_compact_prompt: null } })).body.pre_compact_prompt, null);
  // 送るか（オン / オフ）: 初めはオンで、文と別に変えられる（オフでも文は残す）
  assert.equal(project.pre_compact_enabled, true);
  await call("PUT", "/api/settings", { post_compact_prompt: "読み直す" });
  const off = (await call("PUT", "/api/settings", { post_compact_enabled: false })).body;
  assert.deepEqual([off.post_compact_prompt, off.post_compact_enabled, off.pre_compact_enabled], ["読み直す", false, true]);
  const projectOff = (await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pre_compact_prompt: "書き残す", pre_compact_enabled: false } })).body;
  assert.deepEqual([projectOff.pre_compact_prompt, projectOff.pre_compact_enabled, projectOff.post_compact_enabled], ["書き残す", false, true]);
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pre_compact_enabled: true } })).body.pre_compact_enabled, true);
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { pre_compact_enabled: "no" })).status, 400);
  await call("PUT", "/api/settings", { post_compact_prompt: null, post_compact_enabled: true });
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pre_compact_prompt: null } });

  assert.deepEqual(
    (await api("GET /api/projects")).body.map((p: { id: number }) => p.id),
    [project.id],
  );
  assert.equal((await call("GET", "/api/projects")).body.find((p: { id: number }) => p.id === project.id).name, "p");
  assert.deepEqual(await api("PATCH /api/projects/:projectId", { params: { projectId: 999 }, body: { name: "q" } }), { status: 404, body: { error: "プロジェクトが見つかりません" } });

  const patched = await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { name: "q" } });
  assert.equal(patched.body.name, "q");
  const missing = await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { reference_paths: [{ path: "/no/such/kickoff/path" }] } });
  assert.deepEqual(missing, { status: 400, body: { error: "見つかりません: /no/such/kickoff/path" } });
  const refs = await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { reference_paths: [{ path: project.repo_path }, { path: project.repo_path }] } });
  assert.deepEqual(refs.body.reference_paths, [{ path: project.repo_path, kind: "folder" }]);

  const other = store.projects.create({ name: "o", repo_path: tempDir(), provider: "claude" });
  // サイドバーの並び順は position で持つ。並べ替えは、並べたあとの一覧を返す（グループの並べ替えと同じ）
  const ordered = (await api("PUT /api/projects/order", { body: { ids: [other.id, project.id] } })).body;
  assert.deepEqual(ordered.map((p: { id: number }) => p.id), [other.id, project.id]);
  const positions = new Map((await api("GET /api/projects")).body.map((p: { id: number; position: number }) => [p.id, p.position]));
  assert.deepEqual([positions.get(other.id), positions.get(project.id)], [1, 2]);
  // 管理から外す = Kickoff のゴミ箱へ（入れたゴミ箱の ID を返す）
  assert.equal((await api("DELETE /api/projects/:projectId", { params: { projectId: other.id } })).status, 200);
  assert.equal(store.projects.get(other.id), undefined);

  const inspected = await api("GET /api/workspace/inspect", { query: { path: project.repo_path } });
  assert.equal(inspected.status, 200);
  assert.ok("registered_project_id" in inspected.body);
  // フォルダの指定がなければ 400（起動したフォルダを点検しない）
  assert.equal((await call("GET", "/api/workspace/inspect")).status, 400);
  assert.equal((await api("GET /api/workspace/inspect", { query: { path: " " } })).status, 400);
});

test("新しいプロジェクト: フォルダを Git のリポジトリとして作り、説明（description。取り込み・編集と同じキー）を README の「アイデア」にも書く", async () => {
  const { call, api, store } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const parent = tempDir();
  const created = await api("POST /api/projects", { body: { name: "Todo", description: "やることを管理したい", parent_dir: parent, folder_name: "todo" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.description, "やることを管理したい");
  assert.match(fs.readFileSync(path.join(created.body.repo_path, "README.md"), "utf8"), /## アイデア\n\nやることを管理したい/);
  // 作った場所を、次の新しいプロジェクトの保存先の既定にする
  assert.equal(store.settings.get().projects_dir, parent);
  // 同じ名前の空でないフォルダには作らない（409）
  assert.equal((await api("POST /api/projects", { body: { name: "Todo", parent_dir: parent, folder_name: "todo" } })).status, 409);
  // ほかのプロジェクトとして取り込んだ空のフォルダにも作らない（同じフォルダに 2 つ目のプロジェクトを作らない）
  const empty = path.join(parent, "empty");
  fs.mkdirSync(empty);
  assert.equal((await api("POST /api/projects/import", { body: { path: empty, name: "Empty" } })).status, 201);
  const dup = await call("POST", "/api/projects", { name: "Dup", parent_dir: parent, folder_name: "empty" });
  assert.deepEqual([dup.status, dup.body.error], [409, "このフォルダは「Empty」として登録済みです"]);
  assert.equal(fs.existsSync(path.join(empty, "README.md")), false);
});

test("新しいプロジェクト・取り込みのノートの保存先: note_folder は使える名前にして重なれば「名前-2」、note_dir は別の場所、省けば決めない", async () => {
  const { api, store } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const parent = tempDir();
  const first = (await api("POST /api/projects", { body: { name: "A", parent_dir: parent, folder_name: "a", note_folder: "ノート/a" } })).body;
  assert.deepEqual([first.note_folder, first.note_dir], ["ノート-a", null]);
  const folder = tempDir();
  const imported = (await api("POST /api/projects/import", { body: { path: folder, name: "B", note_folder: "ノート-a" } })).body;
  assert.equal(imported.note_folder, "ノート-a-2");
  const noteDir = tempDir();
  const elsewhere = (await api("POST /api/projects", { body: { name: "C", parent_dir: parent, folder_name: "c", note_folder: "x", note_dir: noteDir } })).body;
  assert.deepEqual([elsewhere.note_folder, elsewhere.note_dir], [null, noteDir]);
  const plain = (await api("POST /api/projects", { body: { name: "D", parent_dir: parent, folder_name: "d" } })).body;
  assert.deepEqual([plain.note_folder, plain.note_dir], [null, null]);
  // 別の場所は絶対パスだけ
  assert.equal((await api("POST /api/projects", { body: { name: "E", parent_dir: parent, folder_name: "e", note_dir: "rel/dir" } })).status, 400);
  assert.equal(store.projects.list().length, 5);
});

test("プロジェクトを上に固定する・しまう（アーカイブ）・戻す", async () => {
  const { api, project } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const pinned = (await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { pinned: true } })).body;
  assert.equal(pinned.pinned, true);
  const archived = (await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { archived: true } })).body;
  assert.ok(archived.archived_at);
  // しまったままもう一度しまっても、しまった日時は変わらない
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { archived: true } })).body.archived_at, archived.archived_at);
  const restored = (await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { archived: false, pinned: false } })).body;
  assert.equal(restored.archived_at, null);
  assert.equal(restored.pinned, false);
});

test("プロジェクトのタグ: 前後の空白と重複を除いて置き換える。長さ・数の上限を超えたら 400", async () => {
  const { call, api, project, store } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  assert.deepEqual(project.tags, []);
  const tagged = (await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { tags: [" 仕事 ", "クライアント A", "仕事"] } })).body;
  assert.deepEqual(tagged.tags, ["仕事", "クライアント A"]);
  assert.deepEqual((await api("GET /api/projects")).body[0].tags, ["仕事", "クライアント A"]);
  // ほかの項目だけを変えても、タグはそのまま
  assert.deepEqual((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { name: "q" } })).body.tags, ["仕事", "クライアント A"]);
  for (const tags of [["x".repeat(31)], ["  "], Array.from({ length: 21 }, (_, i) => `t${i}`), "仕事"]) {
    assert.equal((await call("PATCH", `/api/projects/${project.id}`, { tags })).status, 400, JSON.stringify(tags));
  }
  // 重複を除いて 20 個なら受け付ける
  const many = Array.from({ length: 20 }, (_, i) => `t${i}`);
  assert.deepEqual((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { tags: [...many, "t0"] } })).body.tags, many);
  assert.deepEqual((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { tags: [] } })).body.tags, []);
  assert.deepEqual(store.projects.get(project.id)?.tags, []);
});

test("プロジェクトの色: 一覧の色だけに変えられる", async () => {
  const { api, project } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  assert.ok(typeof project.hue === "number");
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { hue: 222 } })).body.hue, 222);
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { hue: 100 } })).status, 400);
});

test("プロジェクトのフォルダを変える: 取り込みと同じ決まりで確かめ、ほかのプロジェクトのフォルダ・作業中のチャットがあれば 409", async () => {
  const { api, project, store, runner, provider } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const { dir: moved } = gitRepo({ files: { "a.txt": "a" } });
  const real = fs.realpathSync(moved);
  // 見つからないは 400
  assert.equal((await api("PUT /api/projects/:projectId/repo-path", { params: { projectId: project.id }, body: { path: "/no/such/kickoff/folder" } })).status, 400);
  const plain = tempDir();
  // ほかのプロジェクトのフォルダは 409（登録したパスがシンボリックリンクを含んでいても、実体で比べる。macOS の一時フォルダは /var → /private/var）
  const other = store.projects.create({ name: "o", repo_path: moved, provider: "claude" });
  assert.equal((await api("PUT /api/projects/:projectId/repo-path", { params: { projectId: project.id }, body: { path: moved } })).status, 409);
  store.projects.delete(other.id);
  // 作業中のチャットがあれば 409（フォルダは変えない）
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await api("PUT /api/projects/:projectId/repo-path", { params: { projectId: project.id }, body: { path: moved } })).status, 409);
  assert.equal(store.projects.get(project.id)?.repo_path, project.repo_path);
  release();
  await until(() => !runner.isBusy(chatId));
  // 変えると、チャットはそのまま引き継ぐ（実体のパスにそろえる）
  const changed = await api("PUT /api/projects/:projectId/repo-path", { params: { projectId: project.id }, body: { path: moved } });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.repo_path, real);
  assert.equal(store.chats.get(chatId)?.project_id, project.id);
  // 作業フォルダが変わったので、区切り（フォルダの付け替え）を置き、会話を新しいセッションに写す
  const boundary = store.events.list(chatId).find((e) => e.type === "workplace_moved");
  assert.ok(boundary?.type === "workplace_moved");
  assert.deepEqual([boundary.data.reason, boundary.data.from.dir, boundary.data.to.dir], ["folder_moved", project.repo_path, real]);
  assert.equal(store.chats.get(chatId)?.session_id, "moved-1");
  // 次の指示から新しいフォルダで動き、AI への説明のプロジェクトフォルダも新しい場所になる（指示を送るたびに作り直す）
  assert.equal((await api("POST /api/chats/:chatId/messages", { params: { chatId: chatId }, body: { text: "2" } })).status < 300, true);
  await until(() => provider.prompts.length === 2 && !runner.isBusy(chatId));
  assert.equal(provider.lastCwd, real);
  assert.ok(provider.lastSystemPrompt.includes(`- プロジェクトフォルダ: ${real}`));
  // git でないフォルダは、初期化に同意すれば最初のコミットを作って変え、同意しなければ git で管理しないまま変える
  const plain2 = tempDir();
  assert.equal((await api("PUT /api/projects/:projectId/repo-path", { params: { projectId: project.id }, body: { path: plain2 } })).body.repo_path, fs.realpathSync(plain2));
  assert.equal(fs.existsSync(path.join(plain2, ".git")), false);
  const initialized = await api("PUT /api/projects/:projectId/repo-path", { params: { projectId: project.id }, body: { path: plain, init_git: true } });
  assert.equal(initialized.body.repo_path, fs.realpathSync(plain));
  assert.ok(fs.existsSync(path.join(plain, ".git")));
  // いまと同じフォルダ（シンボリックリンクを含むパスで指しても）はそのまま返す
  assert.equal((await api("PUT /api/projects/:projectId/repo-path", { params: { projectId: project.id }, body: { path: plain } })).body.repo_path, fs.realpathSync(plain));
  // 取り込み・点検も実体で比べる
  assert.equal((await api("GET /api/workspace/inspect", { query: { path: plain } })).body.registered_project_id, project.id);
  assert.equal((await api("POST /api/projects/import", { body: { path: plain, name: "dup" } })).status, 409);
});

test("見えないプロジェクト（共通のノート）: 一覧の API には出すが、設定の変更・アーカイブ・固定・フォルダの変更・git の管理・並べ替え・削除は 409 で断る（店からは変えられる）", async () => {
  const { api, call, project, store } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const folder = tempDir();
  const common = store.projects.create({ name: "共通のノート", repo_path: folder, provider: "claude", kind: "common" });
  assert.equal(common.kind, "common");
  assert.equal(project.kind, null);
  // チャットの画面が店から引くので、一覧の API では外さない
  assert.deepEqual(
    (await api("GET /api/projects")).body.map((p) => [p.id, p.kind]),
    [
      [project.id, null],
      [common.id, "common"],
    ],
  );
  const params = { projectId: common.id };
  for (const body of [{ name: "別の名前" }, { archived: true }, { pinned: true }, { note_dir: tempDir() }]) {
    const refused = await call("PATCH", `/api/projects/${common.id}`, body);
    assert.equal(refused.status, 409, JSON.stringify(body));
    assert.match(refused.body.error, /Kickoff が用意したプロジェクトなので/);
  }
  assert.equal((await api("PUT /api/projects/:projectId/repo-path", { params, body: { path: tempDir() } })).status, 409);
  assert.equal((await api("POST /api/projects/:projectId/git/init", { params })).status, 409);
  assert.equal((await api("PUT /api/projects/order", { body: { ids: [common.id, project.id] } })).status, 409);
  assert.equal((await api("DELETE /api/projects/:projectId", { params })).status, 409);
  const after = store.projects.get(common.id)!;
  assert.deepEqual([after.name, after.archived_at, after.pinned, after.repo_path, after.note_dir], ["共通のノート", null, false, folder, null]);
  // ふつうのプロジェクトだけの並べ替えは通る
  assert.equal((await api("PUT /api/projects/order", { body: { ids: [project.id] } })).status, 200);
  // 持ち主の機能（ノート）が店で直に変えるのは断らない
  assert.equal(store.projects.update(common.id, { note_dir: folder }).note_dir, folder);
});

test("git で管理しない新しいプロジェクト・取り込み、あとから git の管理を始める（もう管理していれば 409）", async () => {
  const { call, api } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const parent = tempDir();
  const created = await api("POST /api/projects", { body: { name: "Plain", parent_dir: parent, folder_name: "plain", init_git: false } });
  assert.equal(created.status, 201);
  assert.equal(fs.existsSync(path.join(created.body.repo_path, ".git")), false);
  assert.deepEqual((await api("GET /api/projects/:projectId/git/status", { params: { projectId: created.body.id } })).body, { repo: false });
  // 取り込みも、同意しなければ git で管理しないまま
  const folder = tempDir();
  fs.writeFileSync(path.join(folder, "a.txt"), "a");
  const imported = await api("POST /api/projects/import", { body: { path: folder, name: "Imported" } });
  assert.equal(imported.status, 201);
  assert.equal(fs.existsSync(path.join(folder, ".git")), false);
  // git の管理を始める
  assert.equal((await api("POST /api/projects/:projectId/git/init", { params: { projectId: imported.body.id } })).status, 204);
  const status = (await call("GET", `/api/projects/${imported.body.id}/git/status`)).body;
  assert.deepEqual([status.repo, status.branch, status.unstaged.length], [true, "main", 0]);
  assert.equal((await api("POST /api/projects/:projectId/git/init", { params: { projectId: imported.body.id } })).status, 409);
  // 省くと初期化する
  const withGit = await api("POST /api/projects", { body: { name: "Git", parent_dir: parent, folder_name: "with-git" } });
  assert.equal(fs.existsSync(path.join(withGit.body.repo_path, ".git")), true);
});

test("プロジェクトを削除するとゴミ箱に入り、3 日たって本当に消すとき、中のチャットのエージェントの会話記録も消すよう頼む（作業中のチャットがあれば 409 で消さない）", async () => {
  const { api, project, store, runner, provider, trashBin, trashClock } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const release = provider.hold();
  const chatId: number = (await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1" } })).body.id;
  await until(() => provider.prompts.length === 1);
  assert.equal((await api("DELETE /api/projects/:projectId", { params: { projectId: project.id } })).status, 409);
  assert.ok(store.projects.get(project.id));
  release();
  await until(() => store.chats.get(chatId)?.status === "completed" && !runner.isBusy(chatId));
  const result = store.events.list(chatId).find((e) => e.type === "result")!;
  // 分岐したチャット（アーカイブ済み）のセッションも一緒に
  const forkedId: number = (await api("POST /api/chats/:chatId/fork", { params: { chatId: chatId }, body: { event_id: result.id } })).body.id;
  store.chats.archive(forkedId, true);
  assert.equal((await api("DELETE /api/projects/:projectId", { params: { projectId: project.id } })).status, 200);
  assert.equal(store.chats.get(chatId), undefined);
  assert.equal(provider.discarded.length, 0);
  trashClock.now += TRASH_KEEP_MS + 60_000;
  await trashBin.sweep();
  assert.equal(provider.discarded.length, 1);
  assert.deepEqual([...provider.discarded[0].sessionIds].sort(), ["fork-1", "s1"]);
});

test("AI ごとの既定: 設定の新しいプロジェクトで使う AI と、AI ごとの既定（設定・プロジェクト）を保存し、新しいチャットに当てる（メモの仕様書「0028」の 9 節）。プロジェクトの説明の空は null", async () => {
  const { call, api, project, runner, bus } = setup({ features: ["projects", "chat", "git", "settings", "childChats", "workplaceMove"] });
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const codex = { model: null, effort: "low", permission_mode: "auto", fast_mode: false };
  const saved = await call("PUT", "/api/settings", { default_provider: "codex", provider_chat_defaults: { codex } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.default_provider, "codex");
  assert.deepEqual(saved.body.provider_chat_defaults.codex, codex);
  // 送らなかった AI の分は変えない
  assert.deepEqual(saved.body.provider_chat_defaults.claude, { model: "opus", effort: null, permission_mode: "default", fast_mode: false });
  // Claude Code は既定のモデルを null（その AI の既定）にできない（アプリ・プロジェクトとも）
  assert.equal((await call("PUT", "/api/settings", { provider_chat_defaults: { claude: codex } })).status, 400);
  assert.equal((await api("PUT /api/projects/:projectId/ai-defaults", { params: { projectId: project.id }, body: { provider: "claude", options: { model: null } } })).status, 400);
  // 知らない項目・ないプロジェクトは断る
  assert.equal((await call("PUT", `/api/projects/${project.id}/ai-defaults`, { provider: "codex", options: { color: "red" } })).status, 400);
  assert.equal((await api("PUT /api/projects/:projectId/ai-defaults", { params: { projectId: 999 }, body: { provider: "codex", options: {} } })).status, 404);
  // 新しいプロジェクトは、設定の AI で作る
  const created = await api("POST /api/projects", { body: { name: "新しい", description: "", parent_dir: tempDir(), folder_name: "new-p" } });
  assert.equal(created.body.provider, "codex");
  assert.deepEqual((await api("GET /api/projects/:projectId/ai-defaults", { params: { projectId: created.body.id } })).body, {});
  assert.equal(created.body.description, null);
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: created.body.id }, body: { description: "概要" } })).body.description, "概要");
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: created.body.id }, body: { description: "" } })).body.description, null);

  // プロジェクトの既定は書いた項目だけ重ねる
  const put = await api("PUT /api/projects/:projectId/ai-defaults", { params: { projectId: project.id }, body: { provider: "codex", options: { effort: "high" } } });
  assert.deepEqual(put.body, { codex: { effort: "high" } });
  // 変えたら知らせる（ほかの窓のプロジェクトの設定・新しいチャットの選択が読み直す）
  assert.ok(events.some((e) => e.type === "project_ai_defaults" && e.project_id === project.id && e.defaults.codex?.effort === "high"));
  const chat = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "1", provider: "codex" } });
  assert.deepEqual([chat.body.model, chat.body.effort, chat.body.permission_mode], [null, "high", "auto"]);
  await until(() => !runner.isBusy(chat.body.id));
  assert.deepEqual((await api("GET /api/projects/:projectId/ai-defaults", { params: { projectId: project.id } })).body, { codex: { effort: "high" } });
});
