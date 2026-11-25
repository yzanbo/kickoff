// AI への指示の文の記録（チャットの実行の節）: 場合ごとに、送る指示と指示に添える文脈を __snapshots__/prompts.<場合>.txt に残す。
// 指示を変えたら記録の更新をコミットに含める（ほかの機能が足す節は、その機能の core/prompts.snapshot.test.ts。システムプロンプト全体は src/app/core/net/prompts.test.ts）
import { test } from "vitest";
import { promptRecord } from "@/features/chat/core/testing";
import { matchRecord } from "@/foundation/core/testing/record";
import { setup, until } from "@/app/core/testing/testServer";

// 通信の切断で止まり、つながったら自動で再開する
test("AI への指示の文の記録: resume-network", async () => {
  const ctx = setup();
  ctx.provider.networkFailures = 1;
  ctx.network.online = false;
  const chatId: number = (await ctx.api("POST /api/projects/:projectId/chats", { params: { projectId: ctx.project.id }, body: { text: "1" } })).body.id;
  await until(() => ctx.runner.live(chatId).reconnect !== null);
  ctx.network.online = true;
  await until(() => ctx.provider.prompts.length === 2 && !ctx.runner.isBusy(chatId));
  await matchRecord("__snapshots__/prompts.resume-network.txt", promptRecord({ prompt: ctx.provider.prompts[1], turnContext: ctx.provider.lastTurnContext }, [chatId]));
});

// 共通のチャット: 作業フォルダ・ノートは頼まれたときだけ・利用者のプロジェクトの名前（アーカイブ・ゴミ箱のものは入れない）・共通の概要（共通のノートのチャットは notes の note-chat）
test("AI への指示の文の記録: common-chat", async () => {
  const ctx = setup();
  await ctx.notes.syncCommon();
  const common = ctx.store.projects.list().find((p) => p.kind === "common")!;
  ctx.store.projects.update(common.id, { description: "答えは短く" });
  const archived = ctx.store.projects.create({ name: "しまった", repo_path: "/tmp/kickoff-archived-not-used", provider: "claude" });
  ctx.store.projects.update(archived.id, { archived_at: "2026-01-01T00:00:00.000Z" });
  const trashed = ctx.store.projects.create({ name: "消した", repo_path: "/tmp/kickoff-trashed-not-used", provider: "claude" });
  ctx.store.projects.setTrashed(trashed.id, "2026-01-01T00:00:00.000Z");
  ctx.store.projects.create({ name: "Kickoff Web", repo_path: "/tmp/kickoff-web-not-used", provider: "claude" });
  const chatId: number = (await ctx.api("POST /api/projects/:projectId/chats", { params: { projectId: common.id }, body: { text: "調べて" } })).body.id;
  await until(() => !ctx.runner.isBusy(chatId) && ctx.provider.prompts.length === 1);
  await matchRecord("__snapshots__/prompts.common-chat.txt", promptRecord({ systemPrompt: ctx.provider.lastSystemPrompt }, [chatId]));
});
