// 定型文に足すツール（add_snippet）
import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import { tempDir } from "@/foundation/core/testing/tempDir";
import { callDef, testTurn } from "@/foundation/core/testing/toolCalls";
import { snippetToolGroup } from "./tools";

test("add_snippet: このプロジェクトだけの定型文として足す（名前を省けば null）。空・長すぎるは断る", async () => {
  const store = testStore();
  const ctx = { store, project: store.projects.create({ name: "p", repo_path: tempDir(), provider: "claude" }) };
  const chat = ctx.store.chats.create({ project_id: ctx.project.id, provider: "claude", title: "作業", status: "completed" });
  const [tool] = snippetToolGroup({ snippets: ctx.store.snippets, chatOf: (id) => ctx.store.chats.get(id) }).open(testTurn({ chatId: chat.id }))!;
  const addSnippet = (args: Record<string, unknown>) => callDef(tool, args, testTurn({ chatId: chat.id }));
  assert.match(await addSnippet({ text: "テストを流して", label: "テスト" }), /定型文「テスト」/);
  await addSnippet({ text: "  型を確かめて\n二行目  " });
  assert.deepEqual(
    ctx.store.snippets.list().map((s) => [s.project_id, s.label, s.text]),
    [
      [ctx.project.id, "テスト", "テストを流して"],
      [ctx.project.id, null, "型を確かめて\n二行目"],
    ],
  );
  await assert.rejects(addSnippet({ text: "   " }), /空です/);
  await assert.rejects(addSnippet({ text: "a", label: "あ".repeat(41) }), /40 文字まで/);
});
