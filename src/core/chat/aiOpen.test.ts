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
  assert.ok(published[1].type === "open_view" && published[1].request.place === null);
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
