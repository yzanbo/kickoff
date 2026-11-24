// AI への指示の文の記録（AI を替えたあとの節）: Claude Code で 1 回話してから Codex に替え、最初に送った指示（引き継ぐ会話の資料と Git の状態を添える）を
// __snapshots__/prompts.provider-switch.txt に残す。指示を変えたら記録の更新をコミットに含める
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { eventsOf, promptRecord, untilIdle } from "@/features/chat/core/testing";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { matchRecord } from "@/foundation/core/testing/record";
import { setup, until } from "@/app/core/testing/testServer";

test("AI への指示の文の記録: provider-switch", async () => {
  const ctx = setup();
  gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
  fs.writeFileSync(path.join(ctx.project.repo_path, "a.txt"), "a changed\n");
  const chat = ctx.store.chats.create({ project_id: ctx.project.id, provider: "claude", title: "c", status: "completed" });
  ctx.provider.emits = [{ type: "text", text: "最初の答え" }];
  await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "最初の話" } });
  await untilIdle(ctx, chat.id);
  ctx.provider.emits = [];
  const preview = await ctx.api("GET /api/chats/:chatId/provider-switch", { params: { chatId: chat.id }, query: { target: "codex" } });
  await ctx.api("POST /api/chats/:chatId/provider-switch", { params: { chatId: chat.id }, body: { target: "codex", confirmation: preview.body.confirmation } });
  await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId: chat.id }, body: { text: "Codex への指示" } });
  await until(() => ctx.provider.prompts.length === 2 && !ctx.runner.isBusy(chat.id));
  const eventIds = (await eventsOf(ctx, chat.id)).map((e) => e.id);
  await matchRecord("__snapshots__/prompts.provider-switch.txt", promptRecord({ prompt: ctx.provider.prompts[1], turnContext: ctx.provider.lastTurnContext }, [chat.id, ...eventIds]));
});
