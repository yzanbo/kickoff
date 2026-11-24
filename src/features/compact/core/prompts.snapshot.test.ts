// AI への指示の文の記録（圧縮前指示・圧縮後指示の節）: 共通 → プロジェクトの順につないだ指示を __snapshots__/prompts.<場合>.txt に残す。
// 指示を変えたら記録の更新をコミットに含める
import { test } from "vitest";
import { promptRecord, sendAndWait, untilIdle } from "@/features/chat/core/testing";
import { matchRecord } from "@/foundation/core/testing/record";
import { setup, until } from "@/app/core/testing/testServer";

// 手で圧縮する前・作業中に手で圧縮したとき・自動の圧縮の前
test("AI への指示の文の記録: pre-compact", async () => {
  const ctx = setup();
  const chatId = await sendAndWait(ctx, { projectId: ctx.project.id, text: "はじめ" });
  await ctx.call("PUT", "/api/settings", { pre_compact_prompt: " 共通の指示 " });
  await ctx.api("PATCH /api/projects/:projectId", { params: { projectId: ctx.project.id }, body: { pre_compact_prompt: "プロジェクトの指示" } });
  // 手で圧縮したら要約の記録を残す（残さないと、圧縮するまで次の圧縮前指示を送らない）
  ctx.provider.emitCompactOnCompact = true;
  await ctx.api("POST /api/chats/:chatId/compact", { params: { chatId } });
  await until(() => ctx.provider.prompts.length === 3 && !ctx.runner.isBusy(chatId));
  const manual = ctx.provider.prompts[1];
  const release = ctx.provider.hold();
  await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: "作業" } });
  await until(() => ctx.provider.prompts.length === 4);
  await ctx.api("POST /api/chats/:chatId/compact", { params: { chatId } });
  const busy = ctx.provider.told[0];
  release();
  await until(() => ctx.provider.prompts.at(-1) === "/compact" && !ctx.runner.isBusy(chatId));
  ctx.store.chats.update(chatId, { context_window: 200_000, context_tokens: 120_000 });
  await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: "続けて" } });
  await untilIdle(ctx, chatId);
  await matchRecord(
    "__snapshots__/prompts.pre-compact.txt",
    promptRecord({ "prompt（手で圧縮する前）": manual, "伝える文（作業中に手で圧縮したとき）": busy, "preCompact（自動の圧縮の前）": ctx.provider.preCompacts.at(-1)?.message }, [chatId]),
  );
});

// 手で圧縮したあとに新しい作業として送る
test("AI への指示の文の記録: post-compact", async () => {
  const ctx = setup();
  const chatId = await sendAndWait(ctx, { projectId: ctx.project.id, text: "はじめ" });
  await ctx.call("PUT", "/api/settings", { post_compact_prompt: " 共通のあと " });
  await ctx.api("PATCH /api/projects/:projectId", { params: { projectId: ctx.project.id }, body: { post_compact_prompt: "ノートを読み直す" } });
  ctx.provider.emitCompactOnCompact = true;
  await ctx.api("POST /api/chats/:chatId/compact", { params: { chatId } });
  await until(() => ctx.provider.prompts.length === 3 && !ctx.runner.isBusy(chatId));
  await matchRecord("__snapshots__/prompts.post-compact.txt", promptRecord({ prompt: ctx.provider.prompts[2], turnContext: ctx.provider.lastTurnContext }, [chatId]));
});
