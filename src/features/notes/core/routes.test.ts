// API のテスト: プロジェクトのノート（保存先・一覧・中身・保存・作成・動かす・ゴミ箱・チャットの文から作る・HTML のノートが読むファイル・ノートのチャット・整理案。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { test, vi } from "vitest";
import type { BusEvent } from "@shared/foundation/contract";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { AUTH, setup } from "@/app/core/testing/testServer";
import { until } from "@/app/core/testing/testCore";
import { canWatchDirectory } from "@/foundation/core/testing/canWatchDirectory";
import { NOTE_SNAPSHOT_HEADING } from "@/features/attachments/core/testing";
import { chatOf, eventsOf } from "@/features/chat/core/testing";

test("ノートの保存先: 既定は親フォルダの下のプロジェクト名のフォルダ。名前を変えても同じフォルダ、ほかのプロジェクトとは重ねない", async () => {
  const { call, api, project, store, noteFake } = setup({ features: ["notes", "settings", "trash", "database"] });
  assert.deepEqual((await api("GET /api/notes/defaults")).body, { default_dir: noteFake.defaultDir, common_default_dir: path.join(noteFake.defaultDir, "_common"), common_project_id: null, common_unavailable: null });
  const list = (await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body;
  assert.equal(list.dir, path.join(noteFake.defaultDir, project.name));
  assert.equal(list.exists, false);
  assert.deepEqual(list.entries, []);
  // 一覧を読むだけでは名前を決めない（チャットを送る・ノートを作るなど書くときに決める）
  assert.equal(store.projects.get(project.id)?.note_folder, null);
  assert.equal((await api("GET /api/projects/:projectId/note", { params: { projectId: project.id }, query: { path: "a.md" } })).status, 404);
  assert.equal(store.projects.get(project.id)?.note_folder, null);
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "a.md" } })).status, 201);
  assert.equal(store.projects.get(project.id)?.note_folder, project.name);
  // 一度決めたフォルダ名は覚える（プロジェクト名を変えても変わらない）
  await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { name: "改名" } });
  assert.equal(((await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body).dir, list.dir);
  // 同じ名前のほかのプロジェクトは「名前-2」
  const other = store.projects.create({ name: project.name, repo_path: tempDir(), provider: "claude" });
  assert.equal(((await api("GET /api/projects/:projectId/notes", { params: { projectId: other.id } })).body).dir, `${list.dir}-2`);
  await api("POST /api/projects/:projectId/notes", { params: { projectId: other.id }, body: { path: "b.md" } });
  // 名前に空白のあるプロジェクトは空白のままのフォルダ
  const spaced = store.projects.create({ name: "My App", repo_path: tempDir(), provider: "claude" });
  assert.equal(((await api("GET /api/projects/:projectId/notes", { params: { projectId: spaced.id } })).body).dir, path.join(noteFake.defaultDir, "My App"));

  // 親フォルダを設定で変える・このプロジェクトだけ別の場所にする（絶対パスでなければ 400）
  const root = tempDir();
  assert.equal((await call("PUT", "/api/settings", { notes_dir: "notes" })).status, 400);
  await call("PUT", "/api/settings", { notes_dir: root });
  assert.equal(((await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body).dir, path.join(root, project.name));
  const own = tempDir();
  assert.equal((await api("PATCH /api/projects/:projectId", { params: { projectId: project.id }, body: { note_dir: own } })).body.note_dir, own);
  assert.equal(((await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body).dir, own);

  // そのフォルダをノートのフォルダにしているプロジェクト（自分を除く・決めていないプロジェクトは数えない・~ も解く）
  const users = async (dir: string, except?: number) =>
    (await call("GET", `/api/notes/users?path=${encodeURIComponent(dir)}${except ? `&except=${except}` : ""}`)).body.project_ids;
  assert.deepEqual(await users(own), [project.id]);
  assert.deepEqual(await users(own, project.id), []);
  assert.deepEqual(await users(path.join(root, `${project.name}-2`)), [other.id]);
  assert.deepEqual(await users(path.join(root, "まだない")), []);
  await api("PATCH /api/projects/:projectId", { params: { projectId: spaced.id }, body: { note_dir: own } });
  assert.deepEqual(await users(own, project.id), [spaced.id]);
  assert.equal((await call("GET", "/api/notes/users")).status, 400);
});

test("ノート: 作る・一覧・読む・保存（ほかで変わっていれば 409）・動かす・ゴミ箱。変えるたびに知らせる", async () => {
  const { api, project, bus, store } = setup({ features: ["notes", "settings", "trash", "database"] });
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計", dir: true } })).status, 201);
  assert.deepEqual((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計/DB.md", content: "# DB\n" } })).body, { path: "設計/DB.md" });
  // 同じ名前は 409、外・隠しファイルは 400
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計/DB.md" } })).status, 409);
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "../外.md" } })).status, 400);
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: ".秘密.md" } })).status, 400);

  const list = (await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body;
  assert.equal(list.exists, true);
  assert.deepEqual(list.entries.map((e) => [e.path, e.dir]), [["設計", true], ["設計/DB.md", false]]);

  const read = (await api("GET /api/projects/:projectId/note", { params: { projectId: project.id }, query: { path: "設計/DB.md" } })).body;
  assert.equal(read.content, "# DB\n");
  const saved = await api("PUT /api/projects/:projectId/note", { params: { projectId: project.id }, body: { path: "設計/DB.md", content: "# DB\n本文\n", base_hash: read.hash } });
  assert.equal(saved.status, 200);
  // 開いたときの指紋が古ければ 409
  assert.equal((await api("PUT /api/projects/:projectId/note", { params: { projectId: project.id }, body: { path: "設計/DB.md", content: "上書き", base_hash: read.hash } })).status, 409);

  // 動かす（行き先に同じ名前があれば 409、フォルダをその中へは 400）
  assert.deepEqual((await api("POST /api/projects/:projectId/notes/move", { params: { projectId: project.id }, body: { from: "設計/DB.md", to: "DB の方針.md" } })).body, { path: "DB の方針.md" });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計/DB の方針.md" } });
  assert.equal((await api("POST /api/projects/:projectId/notes/move", { params: { projectId: project.id }, body: { from: "DB の方針.md", to: "設計/DB の方針.md" } })).status, 409);
  assert.equal((await api("POST /api/projects/:projectId/notes/move", { params: { projectId: project.id }, body: { from: "設計", to: "設計/中" } })).status, 400);
  assert.equal(fs.readFileSync(path.join(list.dir, "DB の方針.md"), "utf8"), "# DB\n本文\n");

  // ゴミ箱へ（なければ 404）
  const trashed = await api("DELETE /api/projects/:projectId/note", { params: { projectId: project.id }, query: { path: "DB の方針.md" } });
  assert.equal(trashed.status, 200);
  assert.equal(store.trash.get(trashed.body.trash_id)?.origin, path.join(fs.realpathSync(list.dir), "DB の方針.md"));
  assert.deepEqual(store.trash.get(trashed.body.trash_id)?.details, { note: "DB の方針.md" });
  assert.equal((await api("DELETE /api/projects/:projectId/note", { params: { projectId: project.id }, query: { path: "DB の方針.md" } })).status, 404);

  const noteEvents = events.filter((e) => e.type === "notes");
  assert.ok(noteEvents.length >= 5);
  assert.ok(noteEvents.every((e) => e.project_id === project.id));
});

test("ノート: 作る・動かす先の途中のフォルダが、リンクで外を指していれば 400（外にファイルを作らない）", async () => {
  const { api, project } = setup({ features: ["notes", "settings", "trash", "database"] });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "a.md", content: "a" } });
  const { dir } = (await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body;
  const outside = tempDir();
  fs.symlinkSync(outside, path.join(dir, "外へ"));
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "外へ/b.md" } })).status, 400);
  assert.equal((await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "外へ/中/b.md" } })).status, 400);
  assert.equal((await api("POST /api/projects/:projectId/notes/move", { params: { projectId: project.id }, body: { from: "a.md", to: "外へ/a.md" } })).status, 400);
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.ok(fs.existsSync(path.join(dir, "a.md")));
});

test("ノート: 監視からの外部変更を知らせ、隠しファイルは知らせない", async () => {
  const watcher = new EventEmitter() as fs.FSWatcher;
  watcher.close = () => {};
  watcher.unref = () => watcher;
  const watch = vi.spyOn(fs, "watch").mockReturnValue(watcher);
  try {
    const { api, project, bus } = setup({ features: ["notes", "settings", "trash", "database"] });
    await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "初め.md" } });
    const list = (await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body;
    assert.ok(watch.mock.calls.some(([dir, options]) => dir === list.dir && (options as unknown as { recursive?: boolean })?.recursive === true));
    const events: BusEvent[] = [];
    bus.subscribe((e) => events.push(e));
    fs.writeFileSync(path.join(list.dir, ".隠し.md"), "x");
    watcher.emit("change", "rename", ".隠し.md");
    fs.writeFileSync(path.join(list.dir, "外から.md"), "# 外から\n");
    watcher.emit("change", "rename", "外から.md");
    await until(() => events.some((e) => e.type === "notes" && e.project_id === project.id && e.path === "外から.md"));
    assert.ok(!events.some((e) => e.type === "notes" && e.path === ".隠し.md"));
  } finally {
    watch.mockRestore();
  }
});

test("ノート: Kickoff の外（Finder・ほかのアプリ）での変更も、一覧を読んだあとは知らせる（隠しファイルは知らせない）", async (t) => {
  if (!(await canWatchDirectory({ recursive: true }))) t.skip("この環境では OS のファイル監視を開始できません（EMFILE）。実際の監視は別の環境で確認してください");
  const { api, project, bus } = setup({ features: ["notes", "settings", "trash", "database"] });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "初め.md" } });
  const list = (await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body;
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const noteEvents = () => events.filter((e): e is Extract<BusEvent, { type: "notes" }> => e.type === "notes" && e.project_id === project.id);
  fs.writeFileSync(path.join(list.dir, ".隠し.md"), "x");
  // 作ったときの変更の知らせが遅れて届くと、外からの変更とまとめて「どれか分からない」（path null）や作ったファイルの知らせになる。
  // そのときは書き直して、もう一度待つ（決め打ちで待ってから見ると、負荷が高いときに遅れた知らせが待つ長さを超えて混ざった）。
  // 見張り始めた直後の変更は OS が知らせないことがあるので、待ちきれなくても書き直す（前は 1 回目で失敗にしていた）
  const seen = () => noteEvents().some((e) => e.path === "外から.md");
  for (let i = 0; i < 5 && !seen(); i++) {
    const before = noteEvents().length;
    fs.writeFileSync(path.join(list.dir, "外から.md"), `# 外から ${i}\n`);
    await until(() => noteEvents().length > before, 5000).catch(() => undefined);
  }
  assert.ok(seen());
  assert.ok(!events.some((e) => e.type === "notes" && e.path === ".隠し.md"));
});

test("チャットの文からノート: 「<チャット名> チャットノート<n>」で作り、追記・要約もできる", async () => {
  const { api, project, store, provider } = setup({ features: ["notes", "settings", "trash", "database"] });
  const chat = store.chats.create({ project_id: project.id, title: "ログイン画面", provider: "claude", status: "completed" });
  const first = await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: chat.id, text: "認証は Cookie で持つ", summarize: false, append_to: null, folder: null } });
  assert.equal(first.status, 201);
  assert.equal(first.body.path, "ログイン画面 チャットノート1.md");
  const second = await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: chat.id, text: "二つ目", summarize: false, append_to: null, folder: null } });
  assert.equal(second.body.path, "ログイン画面 チャットノート2.md");

  const content = (await api("GET /api/projects/:projectId/note", { params: { projectId: project.id }, query: { path: first.body.path } })).body.content as string;
  assert.match(content, /^# ログイン画面 チャットノート1\n\n> チャット「ログイン画面」から（\d{4}-\d\d-\d\d \d\d:\d\d）\n\n認証は Cookie で持つ\n$/);

  // 追記（区切り線を挟む）と、AI の要約
  const appended = await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: chat.id, text: "とても長い説明の文です", summarize: true, append_to: first.body.path, folder: null } });
  assert.equal(appended.status, 200);
  assert.deepEqual(provider.summarized, ["とても長い説明の文です"]);
  const after = (await api("GET /api/projects/:projectId/note", { params: { projectId: project.id }, query: { path: first.body.path } })).body.content as string;
  assert.match(after, /認証は Cookie で持つ\n\n---\n\n> チャット「ログイン画面」から（.+）\n\n要約: とても長い説明の文で\n$/);

  // フォルダを指定して作る・ほかのプロジェクトのチャットは 400
  const inFolder = await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: chat.id, text: "x", summarize: false, append_to: null, folder: "設計" } });
  assert.equal(inFolder.body.path, "設計/ログイン画面 チャットノート1.md");
  const other = store.projects.create({ name: "別", repo_path: tempDir(), provider: "claude" });
  const otherChat = store.chats.create({ project_id: other.id, title: "別", provider: "claude", status: "completed" });
  assert.equal((await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: otherChat.id, text: "x", summarize: false, append_to: null, folder: null } })).status, 400);

  // HTML のノートには追記しない（ページの外に出てしまうため）
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "資料.html", content: "<p>x</p>" } });
  assert.equal((await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: chat.id, text: "x", summarize: false, append_to: "資料.html", folder: null } })).status, 400);
});

test("チャットの文を既存のノートと AI でまとめる: ノート全体を AI の答えで書き換える（まとめる先がない・答えが空なら 400 で変えない）", async () => {
  const { api, project, store, provider } = setup({ features: ["notes", "settings", "trash", "database"] });
  const chat = store.chats.create({ project_id: project.id, title: "ログイン画面", provider: "claude", status: "completed" });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計.md", content: "# 設計\n\n認証は Cookie\n" } });
  provider.askReply = "```markdown\n# 設計\n\n- 認証は Cookie\n- セッションは 30 日\n```";
  const merged = await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: chat.id, text: "セッションは 30 日", summarize: true, merge: true, append_to: "設計.md", folder: null } });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.path, "設計.md");
  const note = (path: string) => api("GET /api/projects/:projectId/note", { params: { projectId: project.id }, query: { path: path } }).then((r) => r.body.content as string);
  assert.equal(await note("設計.md"), "# 設計\n\n- 認証は Cookie\n- セッションは 30 日\n");
  // AI にはいまのノートと足す文（要約しないそのままの文）を、sonnet で聞く
  const asked = provider.asked.at(-1);
  assert.equal(asked?.model, "standard");
  assert.match(asked?.prompt ?? "", /<いまのノート>\n# 設計\n\n認証は Cookie\n<\/いまのノート>/);
  assert.match(asked?.prompt ?? "", /<足す文 出どころ="チャット「ログイン画面」から（.+）">\nセッションは 30 日\n<\/足す文>$/);
  assert.deepEqual(provider.summarized, []);

  // まとめる先がない・答えが空なら 400（ノートは変えない）
  assert.equal((await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: chat.id, text: "x", summarize: false, merge: true, append_to: null, folder: null } })).status, 400);
  provider.askReply = " \n";
  assert.equal((await api("POST /api/projects/:projectId/notes/from-chat", { params: { projectId: project.id }, body: { chat_id: chat.id, text: "x", summarize: false, merge: true, append_to: "設計.md", folder: null } })).status, 400);
  assert.equal(await note("設計.md"), "# 設計\n\n- 認証は Cookie\n- セッションは 30 日\n");
});

test("HTML のノートが読むファイル: ノートのフォルダのファイルをそのまま返し（種類と sandbox の CSP 付き）、フォルダの外は読ませない", async () => {
  const { app, api, project } = setup({ features: ["notes", "settings", "trash", "database"] });
  const base = `/api/projects/${project.id}`;
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "資料/ページ.html", content: "<link rel=stylesheet href=\"style.css\">" } });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "資料/見た目 #1.css", content: "body { color: red }" } });
  const get = (rel: string) => app.request(`${base}/note/file/${rel}`, { headers: AUTH });

  const css = await get(`${encodeURIComponent("資料")}/${encodeURIComponent("見た目 #1.css")}`);
  assert.equal(css.status, 200);
  assert.equal(css.headers.get("content-type"), "text/css; charset=utf-8");
  assert.equal(css.headers.get("content-security-policy"), "sandbox");
  assert.equal(await css.text(), "body { color: red }");
  // ないファイル・フォルダは 404、フォルダの外・段の中の / は 400
  assert.equal((await get("資料/ない.png")).status, 404);
  assert.equal((await get("資料")).status, 404);
  assert.equal((await get("..%2F..%2Fsecret")).status, 400);
  assert.equal((await get("%E0%A4%A")).status, 400);
  // トークンがなければ読ませない
  assert.equal((await app.request(`${base}/note/file/${encodeURIComponent("資料")}/x.css`)).status, 401);
});

test("ノートのチャット: ノートごとに 1 つのふつうのチャット。ノートのフォルダも読めるようにし、名前の変更・移動で付け替え、ゴミ箱でアーカイブする", async () => {
  const ctx = setup({ features: ["notes", "settings", "trash", "database"] });
  const { api, project, provider, store, bus, noteFake } = ctx;
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計/画面.md", content: "# 画面\n" } });
  // ノートがなければ 404、文も添付もなければ 400
  assert.equal((await api("POST /api/projects/:projectId/note/chat", { params: { projectId: project.id }, body: { path: "ない.md", text: "x" } })).status, 404);
  assert.equal((await api("POST /api/projects/:projectId/note/chat", { params: { projectId: project.id }, body: { path: "設計/画面.md", text: " " } })).status, 400);
  const created = await api("POST /api/projects/:projectId/note/chat", { params: { projectId: project.id }, body: { path: "設計/画面.md", text: "構成を相談したい" } });
  assert.equal(created.status, 201);
  assert.equal(created.body.note_path, "設計/画面.md");
  await until(async () => (await chatOf(ctx, created.body.id)).status === "completed");
  // 作業場所はプロジェクトのまま、ノートのフォルダも読み書きできる場所に足し、どのノートかを伝える
  const noteDir = path.join(noteFake.defaultDir, project.name);
  assert.equal(provider.lastCwd, project.repo_path);
  assert.ok(provider.lastDirs.includes(noteDir));
  assert.match(provider.lastSystemPrompt, new RegExp(`ノート \`${path.join(noteDir, "設計/画面.md")}\``));
  // 同じノートのチャットは 1 つだけ（続きはふつうのチャットと同じく送る）
  assert.equal((await api("POST /api/projects/:projectId/note/chat", { params: { projectId: project.id }, body: { path: "設計/画面.md", text: "もう一度" } })).status, 409);
  // ツールの結果が届いたら、ノートが変わったと知らせる（開いているノートが読み直す）
  provider.emits = [{ type: "tool_result", tool_use_id: "t1", content: "ok", is_error: false }];
  events.length = 0;
  await api("POST /api/chats/:chatId/messages", { params: { chatId: created.body.id }, body: { text: "反映して" } });
  await until(() => events.some((e) => e.type === "notes" && e.path === null));
  provider.emits = [];
  await until(async () => (await chatOf(ctx, created.body.id)).status === "completed");
  // フォルダの名前を変えると、中のノートのチャットと DB の接続の手順ノートも付け替える
  const conn = store.dbConnections.create(project.id, { name: "DB", engine: "sqlite", environment: "local", host: null, port: null, database: null, username: null, file_path: "app.db", ssl: null, read_only: false, ai_access: "allow", note_path: "設計/画面.md", password: null });
  await api("POST /api/projects/:projectId/notes/move", { params: { projectId: project.id }, body: { from: "設計", to: "仕様" } });
  assert.equal((await chatOf(ctx, created.body.id)).note_path, "仕様/画面.md");
  assert.equal(store.dbConnections.get(conn.id)?.note_path, "仕様/画面.md");
  // ゴミ箱に入れたら、そのノートのチャットも同じ行でゴミ箱へ（一覧は 1 行）。別の名前で戻すと、チャットも戻って付け替わる
  const trashed = await api("DELETE /api/projects/:projectId/note", { params: { projectId: project.id }, query: { path: "仕様/画面.md" } });
  assert.equal(store.chats.get(created.body.id), undefined);
  assert.deepEqual(store.chats.trashedWith(trashed.body.trash_id).map((c) => c.id), [created.body.id]);
  assert.equal((await api("GET /api/projects/:projectId/trash", { params: { projectId: project.id } })).body.length, 1);
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "仕様/画面.md", content: "新しい" } });
  await api("POST /api/trash/:itemId/restore", { params: { itemId: trashed.body.trash_id }, body: { rename: true } });
  assert.equal((await chatOf(ctx, created.body.id)).note_path, "仕様/画面 2.md");
  // HTML のノートなら、HTML と CSS で書くことを伝える
  assert.match(provider.lastSystemPrompt, /ノートは Markdown のファイルです/);
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "資料.html", content: "<p>x</p>" } });
  const html = await api("POST /api/projects/:projectId/note/chat", { params: { projectId: project.id }, body: { path: "資料.html", text: "見た目を整えて" } });
  await until(async () => (await chatOf(ctx, html.body.id)).status === "completed");
  assert.match(provider.lastSystemPrompt, /ノートは HTML のファイルです/);
});

test("ノートの添付: 入力欄に添付したノートの写しは、写しと元のノートのパスを AI に伝え、ノートのフォルダを読み書きできる場所に足す（外・隠しファイルは 400）", async () => {
  const ctx = setup({ features: ["notes", "settings", "trash", "database"] });
  const { api, project, provider } = ctx;
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計/DB.md", content: "# DB\n" } });
  const noteDir = ((await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body).dir;
  const snapshot = (await api("POST /api/projects/:projectId/note/snapshot", { params: { projectId: project.id }, body: { path: "設計/DB.md" } })).body;
  for (const outside of ["../外.md", ".隠し.md"]) {
    assert.equal((await api("POST /api/projects/:projectId/note/snapshot", { params: { projectId: project.id }, body: { path: outside } })).status, 400);
    assert.equal((await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "x", attachments: [{ ...snapshot, note: outside }] } })).status, 400);
  }
  // 文がなくても、ノートの添付だけで送れる
  const created = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "", attachments: [snapshot] } });
  assert.equal(created.status, 201);
  await until(async () => (await chatOf(ctx, created.body.id)).status === "completed");
  assert.ok(provider.prompts.at(-1)!.startsWith(`${NOTE_SNAPSHOT_HEADING}:\n- `));
  assert.ok(provider.prompts.at(-1)!.includes(path.join(noteDir, "設計/DB.md")));
  assert.ok(provider.lastDirs.includes(noteDir));
  // 記録には添付のまま残す（画面がノートの札で出す）
  const user = (await eventsOf(ctx, created.body.id)).find((e) => e.type === "user");
  const first = user?.type === "user" ? user.data.attachments?.[0] : undefined;
  assert.equal(first?.kind === "note" && first.note, "設計/DB.md");
  // 続きの指示でも。写しが見つからない添付は書かない
  await api("POST /api/chats/:chatId/messages", { params: { chatId: created.body.id }, body: { text: "続きを書いて", attachments: [snapshot, { ...snapshot, id: randomUUID() }] } });
  await until(async () => provider.prompts.length === 2 && (await chatOf(ctx, created.body.id)).status === "completed");
  assert.equal(provider.prompts[1].split("\n- ").length, 2);
  assert.ok(provider.prompts[1].startsWith(`続きを書いて\n\n${NOTE_SNAPSHOT_HEADING}`));
});

test("ノートの AI: フォルダの整理案は使える案だけを返し、動かさない（ノートがなければ AI に聞かない）", async () => {
  const { api, project, provider } = setup({ features: ["notes", "settings", "trash", "database"] });
  assert.deepEqual((await api("POST /api/projects/:projectId/notes/ai-plan", { params: { projectId: project.id }, body: { instruction: null } })).body, { moves: [], skipped: 0 });
  assert.equal(provider.asked.length, 0);
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "ノート1.md", content: "ログイン画面の設計" } });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計/画面.md", content: "画面" } });
  provider.askReply = (prompt) => {
    assert.match(prompt, /- "ノート1\.md": ログイン画面の設計/);
    assert.match(prompt, /頼み: 設計でまとめて/);
    return '{"moves":[{"from":"ノート1.md","to":"設計/ログイン","reason":"設計"},{"from":"ない.md","to":"x.md"}]}';
  };
  const plan = await api("POST /api/projects/:projectId/notes/ai-plan", { params: { projectId: project.id }, body: { instruction: "設計でまとめて" } });
  assert.deepEqual(plan.body, { moves: [{ from: "ノート1.md", to: "設計/ログイン.md", reason: "設計" }], skipped: 1 });
  const paths = (await api("GET /api/projects/:projectId/notes", { params: { projectId: project.id } })).body.entries.map((e: { path: string }) => e.path);
  assert.ok(paths.includes("ノート1.md"));
});

test("ノートの中の文を探す: すべてのプロジェクトのノート（.md・.html）の行を返す。アーカイブ・ノートのフォルダを決めていないプロジェクトは探さない", async () => {
  const { call, api, project, store } = setup({ features: ["notes", "settings", "trash", "database"] });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "設計/DB.md", content: "# DB\n  索引は Chat ごとに張る\n関係ない行\n" } });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: project.id }, body: { path: "画面.html", content: "<p>chat の一覧</p>\n" } });
  const other = store.projects.create({ name: "ほか", repo_path: tempDir(), provider: "claude" });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: other.id }, body: { path: "ノート.md", content: "CHAT の話\n" } });
  // まだノートのフォルダを決めていないプロジェクトは、探すだけでフォルダ名を決めない
  const fresh = store.projects.create({ name: "まだ", repo_path: tempDir(), provider: "claude" });
  // アーカイブしたプロジェクトは探さない
  const archived = store.projects.create({ name: "しまった", repo_path: tempDir(), provider: "claude" });
  await api("POST /api/projects/:projectId/notes", { params: { projectId: archived.id }, body: { path: "古い.md", content: "chat\n" } });
  await api("PATCH /api/projects/:projectId", { params: { projectId: archived.id }, body: { archived: true } });

  const res = await api("GET /api/notes/search", { query: { q: "chat" } });
  assert.equal(res.status, 200);
  const hits = res.body.hits as { project_id: number; path: string; line: number; text: string; match_start: number; match_end: number }[];
  assert.deepEqual(
    hits.map((h) => [h.project_id, h.path, h.line, h.text.slice(h.match_start, h.match_end)]).sort(),
    [
      [other.id, "ノート.md", 1, "CHAT"],
      [project.id, "画面.html", 1, "chat"],
      [project.id, "設計/DB.md", 2, "Chat"],
    ].sort(),
  );
  assert.equal(res.body.truncated, false);
  assert.equal(store.projects.get(fresh.id)?.note_folder, null);
  // 空なら何も返さない・長すぎれば 400
  assert.deepEqual((await call("GET", "/api/notes/search?q=")).body, { hits: [], truncated: false });
  assert.equal((await api("GET /api/notes/search", { query: { q: "a".repeat(201) } })).status, 400);
});
