// API のテスト: プロジェクトのメモ（保存先・一覧・中身・保存・作成・動かす・ゴミ箱・チャットの文から作る・HTML のメモが読むファイル・メモのチャット・整理案。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { BusEvent, MemoList } from "@shared/types";
import { tempDir } from "../testing/tempDir.js";
import { AUTH, setup } from "../testing/testServer.js";
import { until } from "../testing/testCore.js";

test("メモの保存先: 既定は親フォルダの下のプロジェクト名のフォルダ。名前を変えても同じフォルダ、ほかのプロジェクトとは重ねない", async () => {
  const { call, project, store, memoFake } = setup();
  assert.deepEqual((await call("GET", "/api/memos/defaults")).body, { default_dir: memoFake.defaultDir });
  const list = (await call("GET", `/api/projects/${project.id}/memos`)).body as MemoList;
  assert.equal(list.dir, path.join(memoFake.defaultDir, project.name));
  assert.equal(list.exists, false);
  assert.deepEqual(list.entries, []);
  // 一度決めたフォルダ名は覚える（プロジェクト名を変えても変わらない）
  await call("PATCH", `/api/projects/${project.id}`, { name: "改名" });
  assert.equal(((await call("GET", `/api/projects/${project.id}/memos`)).body as MemoList).dir, list.dir);
  // 同じ名前のほかのプロジェクトは「名前-2」（空白を入れない）
  const other = store.projects.create({ name: project.name, repo_path: tempDir(), provider: "claude" });
  assert.equal(((await call("GET", `/api/projects/${other.id}/memos`)).body as MemoList).dir, `${list.dir}-2`);
  // 名前に空白のあるプロジェクトは「-」でつないだフォルダ
  const spaced = store.projects.create({ name: "My App", repo_path: tempDir(), provider: "claude" });
  assert.equal(((await call("GET", `/api/projects/${spaced.id}/memos`)).body as MemoList).dir, path.join(memoFake.defaultDir, "My-App"));

  // 親フォルダを設定で変える・このプロジェクトだけ別の場所にする（絶対パスでなければ 400）
  const root = tempDir();
  assert.equal((await call("PUT", "/api/settings", { memos_dir: "memos" })).status, 400);
  await call("PUT", "/api/settings", { memos_dir: root });
  assert.equal(((await call("GET", `/api/projects/${project.id}/memos`)).body as MemoList).dir, path.join(root, project.name));
  const own = tempDir();
  assert.equal((await call("PATCH", `/api/projects/${project.id}`, { memo_path: own })).body.memo_path, own);
  assert.equal(((await call("GET", `/api/projects/${project.id}/memos`)).body as MemoList).dir, own);
});

test("メモ: 作る・一覧・読む・保存（ほかで変わっていれば 409）・動かす・ゴミ箱。変えるたびに知らせる", async () => {
  const { call, project, bus, memoFake } = setup();
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const base = `/api/projects/${project.id}`;
  assert.equal((await call("POST", `${base}/memos`, { path: "設計", dir: true })).status, 201);
  assert.deepEqual((await call("POST", `${base}/memos`, { path: "設計/DB.md", content: "# DB\n" })).body, { path: "設計/DB.md" });
  // 同じ名前は 409、外・隠しファイルは 400
  assert.equal((await call("POST", `${base}/memos`, { path: "設計/DB.md" })).status, 409);
  assert.equal((await call("POST", `${base}/memos`, { path: "../外.md" })).status, 400);
  assert.equal((await call("POST", `${base}/memos`, { path: ".秘密.md" })).status, 400);

  const list = (await call("GET", `${base}/memos`)).body as MemoList;
  assert.equal(list.exists, true);
  assert.deepEqual(list.entries.map((e) => [e.path, e.dir]), [["設計", true], ["設計/DB.md", false]]);

  const read = (await call("GET", `${base}/memo?path=${encodeURIComponent("設計/DB.md")}`)).body;
  assert.equal(read.content, "# DB\n");
  const saved = await call("PUT", `${base}/memo`, { path: "設計/DB.md", content: "# DB\n本文\n", base_hash: read.hash });
  assert.equal(saved.status, 200);
  // 開いたときの指紋が古ければ 409
  assert.equal((await call("PUT", `${base}/memo`, { path: "設計/DB.md", content: "上書き", base_hash: read.hash })).status, 409);

  // 動かす（行き先に同じ名前があれば 409、フォルダをその中へは 400）
  assert.deepEqual((await call("POST", `${base}/memos/move`, { from: "設計/DB.md", to: "DB の方針.md" })).body, { path: "DB の方針.md" });
  await call("POST", `${base}/memos`, { path: "設計/DB の方針.md" });
  assert.equal((await call("POST", `${base}/memos/move`, { from: "DB の方針.md", to: "設計/DB の方針.md" })).status, 409);
  assert.equal((await call("POST", `${base}/memos/move`, { from: "設計", to: "設計/中" })).status, 400);
  assert.equal(fs.readFileSync(path.join(list.dir, "DB の方針.md"), "utf8"), "# DB\n本文\n");

  // ゴミ箱へ（なければ 404）
  assert.equal((await call("DELETE", `${base}/memo?path=${encodeURIComponent("DB の方針.md")}`)).status, 204);
  assert.deepEqual(memoFake.trashed, [path.join(fs.realpathSync(list.dir), "DB の方針.md")]);
  assert.equal((await call("DELETE", `${base}/memo?path=${encodeURIComponent("DB の方針.md")}`)).status, 404);

  const memoEvents = events.filter((e) => e.type === "memos");
  assert.ok(memoEvents.length >= 5);
  assert.ok(memoEvents.every((e) => e.project_id === project.id));
});

test("メモ: Kickoff の外（Finder・ほかのアプリ）での変更も、一覧を読んだあとは知らせる（隠しファイルは知らせない）", async () => {
  const { call, project, bus } = setup();
  const base = `/api/projects/${project.id}`;
  await call("POST", `${base}/memos`, { path: "初め.md" });
  const list = (await call("GET", `${base}/memos`)).body as MemoList;
  // 作ったときの変更の知らせが遅れて届いても混ざらないよう、少し待ってから見る
  await new Promise((r) => setTimeout(r, 300));
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  fs.writeFileSync(path.join(list.dir, ".隠し.md"), "x");
  fs.writeFileSync(path.join(list.dir, "外から.md"), "# 外から\n");
  await until(() => events.some((e) => e.type === "memos" && e.project_id === project.id && e.path === "外から.md"));
  assert.ok(!events.some((e) => e.type === "memos" && e.path === ".隠し.md"));
});

test("チャットの文からメモ: 「<チャット名>-チャットメモ<n>」で作り、追記・要約もできる", async () => {
  const { call, project, store, provider } = setup();
  const base = `/api/projects/${project.id}`;
  const chat = store.chats.create({ project_id: project.id, title: "ログイン画面", provider: "claude", status: "completed" });
  const first = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "認証は Cookie で持つ", summarize: false, append_to: null, folder: null });
  assert.equal(first.status, 201);
  assert.equal(first.body.path, "ログイン画面-チャットメモ1.md");
  const second = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "二つ目", summarize: false, append_to: null, folder: null });
  assert.equal(second.body.path, "ログイン画面-チャットメモ2.md");

  const content = (await call("GET", `${base}/memo?path=${encodeURIComponent(first.body.path)}`)).body.content as string;
  assert.match(content, /^# ログイン画面-チャットメモ1\n\n> チャット「ログイン画面」から（\d{4}-\d\d-\d\d \d\d:\d\d）\n\n認証は Cookie で持つ\n$/);

  // 追記（区切り線を挟む）と、AI の要約
  const appended = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "とても長い説明の文です", summarize: true, append_to: first.body.path, folder: null });
  assert.equal(appended.status, 200);
  assert.deepEqual(provider.summarized, ["とても長い説明の文です"]);
  const after = (await call("GET", `${base}/memo?path=${encodeURIComponent(first.body.path)}`)).body.content as string;
  assert.match(after, /認証は Cookie で持つ\n\n---\n\n> チャット「ログイン画面」から（.+）\n\n要約: とても長い説明の文で\n$/);

  // フォルダを指定して作る・ほかのプロジェクトのチャットは 400
  const inFolder = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "x", summarize: false, append_to: null, folder: "設計" });
  assert.equal(inFolder.body.path, "設計/ログイン画面-チャットメモ1.md");
  const other = store.projects.create({ name: "別", repo_path: tempDir(), provider: "claude" });
  const otherChat = store.chats.create({ project_id: other.id, title: "別", provider: "claude", status: "completed" });
  assert.equal((await call("POST", `${base}/memos/from-chat`, { chat_id: otherChat.id, text: "x", summarize: false, append_to: null, folder: null })).status, 400);

  // HTML のメモには追記しない（ページの外に出てしまうため）
  await call("POST", `${base}/memos`, { path: "資料.html", content: "<p>x</p>" });
  assert.equal((await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "x", summarize: false, append_to: "資料.html", folder: null })).status, 400);
});

test("チャットの文を既存のメモと AI でまとめる: メモ全体を AI の答えで書き換える（まとめる先がない・答えが空なら 400 で変えない）", async () => {
  const { call, project, store, provider } = setup();
  const base = `/api/projects/${project.id}`;
  const chat = store.chats.create({ project_id: project.id, title: "ログイン画面", provider: "claude", status: "completed" });
  await call("POST", `${base}/memos`, { path: "設計.md", content: "# 設計\n\n認証は Cookie\n" });
  provider.askReply = "```markdown\n# 設計\n\n- 認証は Cookie\n- セッションは 30 日\n```";
  const merged = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "セッションは 30 日", summarize: true, merge: true, append_to: "設計.md", folder: null });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.path, "設計.md");
  const memo = (path: string) => call("GET", `${base}/memo?path=${encodeURIComponent(path)}`).then((r) => r.body.content as string);
  assert.equal(await memo("設計.md"), "# 設計\n\n- 認証は Cookie\n- セッションは 30 日\n");
  // AI にはいまのメモと足す文（要約しないそのままの文）を、sonnet で聞く
  const asked = provider.asked.at(-1);
  assert.equal(asked?.model, "sonnet");
  assert.match(asked?.prompt ?? "", /<いまのメモ>\n# 設計\n\n認証は Cookie\n<\/いまのメモ>/);
  assert.match(asked?.prompt ?? "", /<足す文 出どころ="チャット「ログイン画面」から（.+）">\nセッションは 30 日\n<\/足す文>$/);
  assert.deepEqual(provider.summarized, []);

  // まとめる先がない・答えが空なら 400（メモは変えない）
  assert.equal((await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "x", summarize: false, merge: true, append_to: null, folder: null })).status, 400);
  provider.askReply = " \n";
  assert.equal((await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "x", summarize: false, merge: true, append_to: "設計.md", folder: null })).status, 400);
  assert.equal(await memo("設計.md"), "# 設計\n\n- 認証は Cookie\n- セッションは 30 日\n");
});

test("HTML のメモが読むファイル: メモのフォルダのファイルをそのまま返し（種類と sandbox の CSP 付き）、フォルダの外は読ませない", async () => {
  const { app, call, project } = setup();
  const base = `/api/projects/${project.id}`;
  await call("POST", `${base}/memos`, { path: "資料/ページ.html", content: "<link rel=stylesheet href=\"style.css\">" });
  await call("POST", `${base}/memos`, { path: "資料/見た目 #1.css", content: "body { color: red }" });
  const get = (rel: string) => app.request(`${base}/memo/file/${rel}`, { headers: AUTH });

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
  assert.equal((await app.request(`${base}/memo/file/${encodeURIComponent("資料")}/x.css`)).status, 401);
});

test("メモのチャット: メモごとに 1 つのふつうのチャット。メモのフォルダも読めるようにし、名前の変更・移動で付け替え、ゴミ箱でアーカイブする", async () => {
  const { call, project, provider, store, bus, memoFake } = setup();
  const events: BusEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const base = `/api/projects/${project.id}`;
  await call("POST", `${base}/memos`, { path: "設計/画面.md", content: "# 画面\n" });
  // メモがなければ 404、文も添付もなければ 400
  assert.equal((await call("POST", `${base}/memo/chat`, { path: "ない.md", text: "x" })).status, 404);
  assert.equal((await call("POST", `${base}/memo/chat`, { path: "設計/画面.md", text: " " })).status, 400);
  const created = await call("POST", `${base}/memo/chat`, { path: "設計/画面.md", text: "構成を相談したい" });
  assert.equal(created.status, 201);
  assert.equal(created.body.memo_path, "設計/画面.md");
  await until(() => store.chats.get(created.body.id)?.status === "completed");
  // 作業場所はプロジェクトのまま、メモのフォルダも読み書きできる場所に足し、どのメモかを伝える
  const memoDir = path.join(memoFake.defaultDir, project.name);
  assert.equal(provider.lastCwd, project.repo_path);
  assert.ok(provider.lastDirs.includes(memoDir));
  assert.match(provider.lastSystemPrompt, new RegExp(`メモ ${path.join(memoDir, "設計/画面.md")}`));
  // 同じメモのチャットは 1 つだけ（続きはふつうのチャットと同じく送る）
  assert.equal((await call("POST", `${base}/memo/chat`, { path: "設計/画面.md", text: "もう一度" })).status, 409);
  // ツールの結果が届いたら、メモが変わったと知らせる（開いているメモが読み直す）
  provider.emits = [{ type: "tool_result", tool_use_id: "t1", content: "ok", is_error: false }];
  events.length = 0;
  await call("POST", `/api/chats/${created.body.id}/messages`, { text: "反映して" });
  await until(() => events.some((e) => e.type === "memos" && e.path === null));
  provider.emits = [];
  await until(() => store.chats.get(created.body.id)?.status === "completed");
  // フォルダの名前を変えると、中のメモのチャットも付け替える
  await call("POST", `${base}/memos/move`, { from: "設計", to: "仕様" });
  assert.equal(store.chats.get(created.body.id)?.memo_path, "仕様/画面.md");
  // ゴミ箱に入れたら、そのメモのチャットはアーカイブする
  await call("DELETE", `${base}/memo?path=${encodeURIComponent("仕様/画面.md")}`);
  assert.ok(store.chats.get(created.body.id)?.archived_at);
  // HTML のメモなら、HTML と CSS で書くことを伝える
  assert.match(provider.lastSystemPrompt, /メモは Markdown のファイルです/);
  await call("POST", `${base}/memos`, { path: "資料.html", content: "<p>x</p>" });
  const html = await call("POST", `${base}/memo/chat`, { path: "資料.html", text: "見た目を整えて" });
  await until(() => store.chats.get(html.body.id)?.status === "completed");
  assert.match(provider.lastSystemPrompt, /メモは HTML のファイルです/);
});

test("メモの添付: 入力欄に添付したメモは、メモのフォルダのファイルのパスを AI に伝え、メモのフォルダを読み書きできる場所に足す（外・隠しファイルは 400）", async () => {
  const { call, project, provider, store } = setup();
  const base = `/api/projects/${project.id}`;
  await call("POST", `${base}/memos`, { path: "設計/DB.md", content: "# DB\n" });
  const memoDir = ((await call("GET", `${base}/memos`)).body as MemoList).dir;
  const memo = (p: string) => ({ id: randomUUID(), name: path.basename(p), mime: "text/markdown", size: 0, memo: p });
  assert.equal((await call("POST", `${base}/chats`, { text: "x", attachments: [memo("../外.md")] })).status, 400);
  assert.equal((await call("POST", `${base}/chats`, { text: "x", attachments: [memo(".隠し.md")] })).status, 400);
  // 文がなくても、メモの添付だけで送れる
  const created = await call("POST", `${base}/chats`, { text: "", attachments: [memo("設計/DB.md")] });
  assert.equal(created.status, 201);
  await until(() => store.chats.get(created.body.id)?.status === "completed");
  assert.match(provider.prompts.at(-1)!, /^添付したメモ（[^\n]*）:\n- .*設計\/DB\.md$/);
  assert.ok(provider.prompts.at(-1)!.includes(path.join(memoDir, "設計/DB.md")));
  assert.ok(provider.lastDirs.includes(memoDir));
  // 記録には添付のまま残す（画面がメモの札で出す）
  const user = store.events.list(created.body.id).find((e) => e.type === "user");
  assert.equal(user?.type === "user" && user.data.attachments?.[0].memo, "設計/DB.md");
  // 続きの指示でも。見つからないメモは書かない
  await call("POST", `/api/chats/${created.body.id}/messages`, { text: "続きを書いて", attachments: [memo("設計/DB.md"), memo("ない.md")] });
  await until(() => provider.prompts.length === 2 && store.chats.get(created.body.id)?.status === "completed");
  assert.equal(provider.prompts[1].split("\n- ").length, 2);
  assert.ok(provider.prompts[1].startsWith("続きを書いて\n\n添付したメモ"));
});

test("メモの AI: フォルダの整理案は使える案だけを返し、動かさない（メモがなければ AI に聞かない）", async () => {
  const { call, project, provider } = setup();
  const base = `/api/projects/${project.id}`;
  assert.deepEqual((await call("POST", `${base}/memos/ai-plan`, { instruction: null })).body, { moves: [], skipped: 0 });
  assert.equal(provider.asked.length, 0);
  await call("POST", `${base}/memos`, { path: "メモ1.md", content: "ログイン画面の設計" });
  await call("POST", `${base}/memos`, { path: "設計/画面.md", content: "画面" });
  provider.askReply = (prompt) => {
    assert.match(prompt, /- メモ1\.md: ログイン画面の設計/);
    assert.match(prompt, /頼み: 設計でまとめて/);
    return '{"moves":[{"from":"メモ1.md","to":"設計/ログイン","reason":"設計"},{"from":"ない.md","to":"x.md"}]}';
  };
  const plan = await call("POST", `${base}/memos/ai-plan`, { instruction: "設計でまとめて" });
  assert.deepEqual(plan.body, { moves: [{ from: "メモ1.md", to: "設計/ログイン.md", reason: "設計" }], skipped: 1 });
  const paths = (await call("GET", `${base}/memos`)).body.entries.map((e: { path: string }) => e.path);
  assert.ok(paths.includes("メモ1.md"));
});
