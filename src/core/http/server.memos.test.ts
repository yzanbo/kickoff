// API のテスト: プロジェクトのメモ（保存先・一覧・中身・保存・作成・動かす・ゴミ箱・チャットの文から作る。共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { BusEvent, MemoList } from "@shared/types";
import { tempDir } from "../testing/tempDir.js";
import { setup } from "../testing/testServer.js";

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
  // 同じ名前のほかのプロジェクトは「名前 2」
  const other = store.projects.create({ name: project.name, repo_path: tempDir(), provider: "claude" });
  assert.equal(((await call("GET", `/api/projects/${other.id}/memos`)).body as MemoList).dir, `${list.dir} 2`);

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

test("チャットの文からメモ: 「<チャット名> チャットメモ<n>」で作り、追記・要約もできる", async () => {
  const { call, project, store, provider } = setup();
  const base = `/api/projects/${project.id}`;
  const chat = store.chats.create({ project_id: project.id, title: "ログイン画面", provider: "claude", status: "completed" });
  const first = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "認証は Cookie で持つ", summarize: false, append_to: null, folder: null });
  assert.equal(first.status, 201);
  assert.equal(first.body.path, "ログイン画面 チャットメモ1.md");
  const second = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "二つ目", summarize: false, append_to: null, folder: null });
  assert.equal(second.body.path, "ログイン画面 チャットメモ2.md");

  const content = (await call("GET", `${base}/memo?path=${encodeURIComponent(first.body.path)}`)).body.content as string;
  assert.match(content, /^# ログイン画面 チャットメモ1\n\n> チャット「ログイン画面」から（\d{4}-\d\d-\d\d \d\d:\d\d）\n\n認証は Cookie で持つ\n$/);

  // 追記（区切り線を挟む）と、AI の要約
  const appended = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "とても長い説明の文です", summarize: true, append_to: first.body.path, folder: null });
  assert.equal(appended.status, 200);
  assert.deepEqual(provider.summarized, ["とても長い説明の文です"]);
  const after = (await call("GET", `${base}/memo?path=${encodeURIComponent(first.body.path)}`)).body.content as string;
  assert.match(after, /認証は Cookie で持つ\n\n---\n\n> チャット「ログイン画面」から（.+）\n\n要約: とても長い説明の文で\n$/);

  // フォルダを指定して作る・ほかのプロジェクトのチャットは 400
  const inFolder = await call("POST", `${base}/memos/from-chat`, { chat_id: chat.id, text: "x", summarize: false, append_to: null, folder: "設計" });
  assert.equal(inFolder.body.path, "設計/ログイン画面 チャットメモ1.md");
  const other = store.projects.create({ name: "別", repo_path: tempDir(), provider: "claude" });
  const otherChat = store.chats.create({ project_id: other.id, title: "別", provider: "claude", status: "completed" });
  assert.equal((await call("POST", `${base}/memos/from-chat`, { chat_id: otherChat.id, text: "x", summarize: false, append_to: null, folder: null })).status, 400);
});

test("メモの AI: 会話の返事と変更の案を返すだけで保存しない（sonnet で聞く。選んだ部分がないのに selection の案なら案は付けない）", async () => {
  const { call, project, provider } = setup();
  const base = `/api/projects/${project.id}`;
  await call("POST", `${base}/memos`, { path: "a.md", content: "# 元\n" });
  provider.askReply = '表にしました。\n<memo-edit target="selection">\n| 形式 |\n</memo-edit>';
  const messages = [{ role: "user", text: "表にして" }];
  const withSel = await call("POST", `${base}/memo/chat`, { messages, memo: "# 元\n- Excel", selection: "- Excel" });
  assert.equal(withSel.status, 200);
  assert.deepEqual(withSel.body, { reply: "表にしました。", edit: { target: "selection", text: "| 形式 |" } });
  assert.equal(provider.asked[0].model, "sonnet");
  assert.match(provider.asked[0].prompt, /利用者: 表にして$/);
  const noSel = await call("POST", `${base}/memo/chat`, { messages, memo: "# 元", selection: null });
  assert.deepEqual(noSel.body, { reply: "表にしました。", edit: null });
  assert.equal((await call("GET", `${base}/memo?path=a.md`)).body.content, "# 元\n");
  // 最後が利用者の空でない発言でなければ 400
  assert.equal((await call("POST", `${base}/memo/chat`, { messages: [{ role: "assistant", text: "x" }], memo: "", selection: null })).status, 400);
  assert.equal((await call("POST", `${base}/memo/chat`, { messages: [{ role: "user", text: " " }], memo: "", selection: null })).status, 400);
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
