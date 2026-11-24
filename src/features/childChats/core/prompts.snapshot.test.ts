// AI への指示の文の記録（子チャットの節）: 子チャットの最初の指示・親へ渡す指示を __snapshots__/prompts.<場合>.txt に残す。指示を変えたら記録の更新をコミットに含める
import { test } from "vitest";
import { eventsOf, promptRecord, sendAndWait, untilIdle } from "@/features/chat/core/testing";
import { matchRecord } from "@/foundation/core/testing/record";
import { setup } from "@/app/core/testing/testServer";

/** 親チャット（1 回送って終わった）を作る */
async function parentChat() {
  const ctx = setup();
  const parentId = await sendAndWait(ctx, { projectId: ctx.project.id, text: "親の質問" });
  return { ctx, parentId };
}

test("AI への指示の文の記録: child-first", async () => {
  const { ctx, parentId } = await parentChat();
  const answer = (await eventsOf(ctx, parentId, { types: ["result"] }))[0];
  const child = (await ctx.api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "これはどういう意味？", quote: "Hono の middleware", inherit: true, event_id: answer.id } })).body;
  await untilIdle(ctx, child.id);
  await matchRecord("__snapshots__/prompts.child-first.txt", promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext }, [parentId, child.id]));
});

test("AI への指示の文の記録: child-no-inherit", async () => {
  const { ctx, parentId } = await parentChat();
  const child = (await ctx.api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "質問", inherit: false } })).body;
  await untilIdle(ctx, child.id);
  await matchRecord("__snapshots__/prompts.child-no-inherit.txt", promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext }, [parentId, child.id]));
});

// 子チャットの最後の返答を親チャットに渡して、すぐ送る
test("AI への指示の文の記録: hand-back", async () => {
  const { ctx, parentId } = await parentChat();
  ctx.provider.emits = [
    { type: "text", text: "確認します" },
    { type: "tool_use", id: "r1", name: "Read", input: { file_path: "a.ts" } },
    { type: "tool_result", tool_use_id: "r1", content: "…", is_error: false },
    { type: "text", text: "子チャット「依頼」で検討した結果、次をお願いします。" },
  ];
  const child = (await ctx.api("POST /api/chats/:chatId/children", { params: { chatId: parentId }, body: { text: "依頼", inherit: false } })).body;
  await untilIdle(ctx, child.id);
  ctx.provider.emits = [];
  const end = (await eventsOf(ctx, child.id, { types: ["result"] }))[0];
  await ctx.api("POST /api/chats/:chatId/handoff", { params: { chatId: child.id }, body: { via: "send", turn_event_id: end.id } });
  await untilIdle(ctx, parentId);
  await matchRecord("__snapshots__/prompts.hand-back.txt", promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext }, [parentId, child.id]));
});
