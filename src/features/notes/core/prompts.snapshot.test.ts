// AI への指示の文の記録（ノートのチャットの節）: Markdown・HTML のノートと共通のノートのノートのチャットのシステムプロンプトを __snapshots__/prompts.note-chat.txt に残す。
// 指示を変えたら記録の更新をコミットに含める
import { test } from "vitest";
import { promptRecord, untilIdle } from "@/features/chat/core/testing";
import { matchRecord } from "@/foundation/core/testing/record";
import { setup } from "@/app/core/testing/testServer";

test("AI への指示の文の記録: note-chat", async () => {
  const ctx = setup();
  await ctx.notes.syncCommon();
  const common = ctx.store.projects.list().find((p) => p.kind === "common")!;
  const systemPrompts: string[] = [];
  for (const [projectId, file, content] of [[ctx.project.id, "設計/画面.md", "# 画面\n"], [ctx.project.id, "資料.html", "<p>x</p>"], [common.id, "覚え書き.md", "# 覚え書き\n"]] as const) {
    await ctx.api("POST /api/projects/:projectId/notes", { params: { projectId }, body: { path: file, content } });
    const chat = (await ctx.api("POST /api/projects/:projectId/note/chat", { params: { projectId }, body: { path: file, text: "相談したい" } })).body;
    await untilIdle(ctx, chat.id);
    systemPrompts.push(ctx.provider.lastSystemPrompt);
  }
  await matchRecord(
    "__snapshots__/prompts.note-chat.txt",
    promptRecord({ "systemPrompt（Markdown のノート）": systemPrompts[0], "systemPrompt（HTML のノート）": systemPrompts[1], "systemPrompt（共通のノート）": systemPrompts[2] }, []),
  );
});
