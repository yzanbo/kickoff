// AI への指示の文の記録（ノートのチャットの節）: Markdown と HTML のノートのチャットのシステムプロンプトを __snapshots__/prompts.note-chat.txt に残す。
// 指示を変えたら記録の更新をコミットに含める
import { test } from "vitest";
import { promptRecord, untilIdle } from "@/features/chat/core/testing";
import { matchRecord } from "@/foundation/core/testing/record";
import { setup } from "@/app/core/testing/testServer";

test("AI への指示の文の記録: note-chat", async () => {
  const ctx = setup();
  const systemPrompts: string[] = [];
  for (const [file, content] of [["設計/画面.md", "# 画面\n"], ["資料.html", "<p>x</p>"]]) {
    await ctx.api("POST /api/projects/:projectId/notes", { params: { projectId: ctx.project.id }, body: { path: file, content } });
    const chat = (await ctx.api("POST /api/projects/:projectId/note/chat", { params: { projectId: ctx.project.id }, body: { path: file, text: "相談したい" } })).body;
    await untilIdle(ctx, chat.id);
    systemPrompts.push(ctx.provider.lastSystemPrompt);
  }
  await matchRecord("__snapshots__/prompts.note-chat.txt", promptRecord({ "systemPrompt（Markdown のノート）": systemPrompts[0], "systemPrompt（HTML のノート）": systemPrompts[1] }, []));
});
