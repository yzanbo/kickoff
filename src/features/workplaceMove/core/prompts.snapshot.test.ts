// AI への指示の文の記録（作業場所を移したあとの節）: 変更を持って新しいワークツリーへ移したあと、最初に送った指示を __snapshots__/prompts.workplace-moved.txt に残す。
// 指示を変えたら記録の更新をコミットに含める
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { promptRecord, sendAndWait, untilIdle } from "@/features/chat/core/testing";
import { gitRepo } from "@/foundation/core/testing/gitRepo";
import { matchRecord } from "@/foundation/core/testing/record";
import { setup } from "@/app/core/testing/testServer";

test("AI への指示の文の記録: workplace-moved", async () => {
  const ctx = setup();
  gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "a\n" } });
  const chatId = await sendAndWait(ctx, { projectId: ctx.project.id, text: "こんにちは" });
  fs.writeFileSync(path.join(ctx.project.repo_path, "a.txt"), "a changed\n");
  await ctx.api("POST /api/chats/:chatId/workplace", { params: { chatId }, body: { worktree_path: null, new_worktree_branch: "feat/move", carry: true } });
  await ctx.api("POST /api/chats/:chatId/messages", { params: { chatId }, body: { text: "続けて" } });
  await untilIdle(ctx, chatId);
  await matchRecord("__snapshots__/prompts.workplace-moved.txt", promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext }, [chatId]));
});
