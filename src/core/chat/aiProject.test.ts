// チャットの AI がプロジェクトに足す・変えるツールの中身（定型文はこのプロジェクトだけに足す・メモはメモのフォルダの中で動かし、つながりを付け替える）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { MemoService } from "../memos/memos.js";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore } from "../testing/testCore.js";
import { tempDir } from "../testing/tempDir.js";
import { createAiProjectTools } from "./aiProject.js";

function setup() {
  const ctx = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "s", turns: 1, result: "" })));
  const base = { project_id: ctx.project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, parent_chat_id: null };
  const chat = ctx.store.chats.create({ ...base, title: "作業", memo_path: null });
  const memos = new MemoService({ store: ctx.store, defaultDir: tempDir(), providers: ctx.providers, publish: () => {}, trashBin: { putPath: async () => { throw new Error("使わない"); } } });
  const dir = memos.dirOf(ctx.store.projects.get(ctx.project.id)!);
  fs.mkdirSync(path.join(dir, "済"), { recursive: true });
  fs.writeFileSync(path.join(dir, "案.md"), "# 案");
  fs.writeFileSync(path.join(dir, "済", "前の案.md"), "# 前");
  const memoChat = ctx.store.chats.create({ ...base, title: "案のメモのチャット", memo_path: "案.md" });
  return { ...ctx, chat, memoChat, memos, dir, tools: createAiProjectTools({ store: ctx.store, memos }, chat.id) };
}

test("add_snippet: このプロジェクトだけの定型文として足す（名前を省けば null）。空・長すぎるは断る", () => {
  const ctx = setup();
  assert.match(ctx.tools.addSnippet({ text: "テストを流して", label: "テスト" }), /定型文「テスト」/);
  ctx.tools.addSnippet({ text: "  型を確かめて\n二行目  " });
  assert.deepEqual(
    ctx.store.snippets.list().map((s) => [s.project_id, s.label, s.text]),
    [
      [ctx.project.id, "テスト", "テストを流して"],
      [ctx.project.id, null, "型を確かめて\n二行目"],
    ],
  );
  assert.throws(() => ctx.tools.addSnippet({ text: "   " }), /空です/);
  assert.throws(() => ctx.tools.addSnippet({ text: "a", label: "あ".repeat(41) }), /40 文字まで/);
});

test("move_memo: メモのフォルダの中で動かし、メモのチャットのつながりも付け替える。上書き・外・拡張子の変更は断る", async () => {
  const ctx = setup();
  assert.match(await ctx.tools.moveMemo({ from: "案.md", to: "済/案.md" }), /「案.md」を「済\/案.md」に動かしました/);
  assert.ok(fs.existsSync(path.join(ctx.dir, "済", "案.md")));
  assert.equal(ctx.store.chats.get(ctx.memoChat.id)?.memo_path, "済/案.md");
  await assert.rejects(ctx.tools.moveMemo({ from: "済/案.md", to: "済/前の案.md" }), /同じ名前/);
  await assert.rejects(ctx.tools.moveMemo({ from: "済/案.md", to: "../外.md" }), /外です/);
  await assert.rejects(ctx.tools.moveMemo({ from: "済/案.md", to: "済/案.html" }), /拡張子は変えられません/);
  await assert.rejects(ctx.tools.moveMemo({ from: "ない.md", to: "ある.md" }), /見つかりません/);
  // フォルダごと
  await ctx.tools.moveMemo({ from: "済", to: "archive/2026" });
  assert.equal(ctx.store.chats.get(ctx.memoChat.id)?.memo_path, "archive/2026/案.md");
});
