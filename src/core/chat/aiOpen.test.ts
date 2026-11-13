// チャットの AI がメモ・家系のチャットを開くツールの中身（パスの確かめ・家系の範囲・画面への頼み）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { BusEvent } from "@shared/types";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore } from "../testing/testCore.js";
import { tempDir } from "../testing/tempDir.js";
import { createAiOpenTools, memoPathIn } from "./aiOpen.js";

/** すぐ終わる偽のプロバイダーで組み立て、根 ─ 子 ─ 孫 と、別の家系の「よそ」・メモのフォルダを用意する */
function setup() {
  const provider = new ScriptedProvider(async (params) => ({ status: "completed", sessionId: "s", turns: 1, result: params.prompt }));
  const ctx = setupCore(provider);
  const { store, project } = ctx;
  const base = { project_id: project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, memo_path: null };
  const root = store.chats.create({ ...base, title: "根", parent_chat_id: null });
  const child = store.chats.create({ ...base, title: "子", parent_chat_id: root.id });
  const grandchild = store.chats.create({ ...base, title: "孫", parent_chat_id: child.id });
  const other = store.chats.create({ ...base, title: "よそ", parent_chat_id: null });
  const memoDir = tempDir();
  fs.mkdirSync(path.join(memoDir, "機能の仕様"), { recursive: true });
  fs.writeFileSync(path.join(memoDir, "機能の仕様", "図.html"), "<h1>図</h1>");
  fs.writeFileSync(path.join(memoDir, "画像.png"), "");
  const published: BusEvent[] = [];
  const toolsOf = (chatId: number) => createAiOpenTools({ store, publish: (e) => published.push(e), memoDirOf: () => memoDir }, chatId);
  return { ctx, root, child, grandchild, other, memoDir, published, toolsOf };
}

test("memoPathIn: 相対・中の絶対パスはメモのフォルダからの相対パスに、外・フォルダそのもの・「.」で始まる名前は断る", () => {
  const dir = tempDir();
  assert.equal(memoPathIn(dir, "a/b.md"), "a/b.md");
  assert.equal(memoPathIn(dir, path.join(dir, "a", "b.md")), "a/b.md");
  assert.throws(() => memoPathIn(dir, "../外.md"), /外です/);
  assert.throws(() => memoPathIn(dir, "/etc/hosts"), /外です/);
  assert.throws(() => memoPathIn(dir, dir), /フォルダそのもの/);
  assert.throws(() => memoPathIn(dir, ".hidden/a.md"), /「\.」で始まる/);
  assert.throws(() => memoPathIn(dir, "  "), /空です/);
});

test("open_memo: 孫チャットからでも、場所と頼んだチャットまでの系譜を付けて画面に頼む", async () => {
  const { root, child, grandchild, memoDir, published, toolsOf, ctx } = setup();
  const result = await toolsOf(grandchild.id).openMemo({ path: path.join(memoDir, "機能の仕様", "図.html"), place: "window" });
  assert.match(result, /別ウィンドウ/);
  assert.equal(published.length, 1);
  const e = published[0];
  assert.ok(e.type === "open_view" && e.request.kind === "memo");
  assert.equal(e.request.project_id, ctx.project.id);
  assert.equal(e.request.path, "機能の仕様/図.html");
  assert.equal(e.request.place, "window");
  assert.deepEqual(
    e.request.lineage.map((c) => c.id),
    [root.id, child.id, grandchild.id],
  );
  // 場所を省くと null（画面の設定の開き方）
  const plain = await toolsOf(child.id).openMemo({ path: "機能の仕様/図.html" });
  assert.match(plain, /設定の「チャットからメモを開く場所」/);
  assert.ok(published[1].type === "open_view" && published[1].request.kind === "memo" && published[1].request.place === null);
});

test("open_memo: ないメモ・メモでないファイル・外のファイルは断り、画面に頼まない", async () => {
  const { child, published, toolsOf } = setup();
  const tools = toolsOf(child.id);
  await assert.rejects(tools.openMemo({ path: "ない.md" }), /見つかりません/);
  await assert.rejects(tools.openMemo({ path: "画像.png" }), /メモ（\.md/);
  await assert.rejects(tools.openMemo({ path: "../外.md" }), /外です/);
  assert.equal(published.length, 0);
});

test("open_chat: 家系のチャットは開くよう頼み（親チャットはチャットのパネル）、家系の外は断る", () => {
  const { root, child, grandchild, other, published, toolsOf } = setup();
  const tools = toolsOf(child.id);
  assert.match(tools.openChat({ chat_id: grandchild.id, place: "side" }), /右の欄/);
  const e = published[0];
  assert.ok(e.type === "open_view" && e.request.kind === "chat");
  assert.equal(e.request.place, "side");
  assert.deepEqual(
    e.request.lineage.map((c) => c.id),
    [root.id, child.id, grandchild.id],
  );
  assert.match(tools.openChat({ chat_id: root.id, place: "window" }), /チャットのパネル/);
  assert.throws(() => tools.openChat({ chat_id: other.id }), /家系（.*）にありません/);
  assert.equal(published.length, 2);
});

test("open_file・open_diff: 作業場所の中のファイルを、頼んだチャットの系譜と一緒に頼む（外・ないファイルは断る。差分は消したファイルでもよい）", async () => {
  const { ctx, root, child, published, toolsOf } = setup();
  fs.mkdirSync(path.join(ctx.project.repo_path, "src"));
  fs.writeFileSync(path.join(ctx.project.repo_path, "src", "a.ts"), "x");
  const tools = toolsOf(child.id);
  assert.match(await tools.openFile({ path: "src/a.ts", line: 12, place: "window" }), /「src\/a.ts」の 12 行目を別ウィンドウで/);
  const e = published[0];
  assert.ok(e.type === "open_view" && e.request.kind === "file");
  assert.deepEqual([e.request.path, e.request.line, e.request.worktree, e.request.lineage.map((c) => c.id)], ["src/a.ts", 12, null, [root.id, child.id]]);
  // 絶対パスも作業場所の中なら相対に
  await tools.openFile({ path: path.join(ctx.project.repo_path, "src", "a.ts") });
  assert.ok(published[1].type === "open_view" && published[1].request.kind === "file" && published[1].request.path === "src/a.ts" && published[1].request.place === null);
  await assert.rejects(tools.openFile({ path: "ない.ts" }), /見つかりません/);
  await assert.rejects(tools.openFile({ path: "/etc/hosts" }), /作業場所.*の外です/);
  assert.match(tools.openDiff({ path: "消した.ts" }), /消した.ts の位置/);
  assert.match(tools.openDiff({}), /コミットしていない変更を右の欄で/);
  assert.ok(published[3].type === "open_view" && published[3].request.kind === "diff" && published[3].request.path === null);
  assert.throws(() => tools.openDiff({ path: "../外.ts" }), /外です/);
  assert.equal(published.length, 4);
});

test("open_sql: AI に見せる接続だけを選べ（1 つなら省ける）、見せない接続は名前を出さずに断る", () => {
  const { ctx, child, published, toolsOf } = setup();
  const conn = (name: string, ai_access: "none" | "allow") =>
    ctx.store.dbConnections.create(ctx.project.id, { name, engine: "sqlite", environment: "dev", host: null, port: null, database: null, username: null, file_path: "app.db", ssl: null, read_only: false, ai_access });
  const tools = toolsOf(child.id);
  assert.throws(() => tools.openSql({ sql: "SELECT 1" }), /AI に見せる DB の接続がありません/);
  conn("本番", "none");
  const dev = conn("開発", "allow");
  assert.match(tools.openSql({ sql: "  UPDATE users SET name = 'a' WHERE id = 1;  " }), /接続「開発」の新しい SQL のタブ/);
  const e = published[0];
  assert.ok(e.type === "open_view" && e.request.kind === "sql");
  assert.deepEqual([e.request.connection_id, e.request.sql], [dev.id, "UPDATE users SET name = 'a' WHERE id = 1;"]);
  assert.throws(() => tools.openSql({ sql: "SELECT 1", connection: "本番" }), (err: Error) => /AI に見せる接続はありません（AI に見せる接続: 開発/.test(err.message));
  conn("ステージング", "allow");
  assert.throws(() => tools.openSql({ sql: "SELECT 1" }), /connection に接続の名前/);
  assert.equal(published.length, 1);
});

test("add_draft: 家系のチャットに頼み、親チャットに入れるときだけ「子チャットから」の印。家系の外・アーカイブ済み・空は断る", () => {
  const { ctx, root, child, grandchild, other, published, toolsOf } = setup();
  const tools = toolsOf(child.id);
  assert.match(tools.addDraft({ chat_id: root.id, text: " 調べた結果です " }), /チャット「根」（ID \d+・親）の入力欄に下書き/);
  const e = published[0];
  assert.ok(e.type === "chat_draft");
  assert.deepEqual([e.request.text, e.request.from, e.request.lineage.map((c) => c.id)], ["調べた結果です", { chat_id: child.id, title: "子" }, [root.id]]);
  tools.addDraft({ chat_id: grandchild.id, text: "続けて" });
  assert.ok(published[1].type === "chat_draft" && published[1].request.from === null);
  assert.throws(() => tools.addDraft({ chat_id: other.id, text: "a" }), /家系（.*）にありません/);
  assert.throws(() => tools.addDraft({ chat_id: root.id, text: "  " }), /空です/);
  ctx.store.chats.archive(grandchild.id, true);
  assert.throws(() => tools.addDraft({ chat_id: grandchild.id, text: "a" }), /アーカイブ済み/);
  assert.equal(published.length, 2);
});
