// AI への指示の文の記録（サブエージェントに子チャットで聞く節）: 指示と、会話の記録を Markdown にした添付を __snapshots__/prompts.subagent-ask.txt に残す。
// 指示を変えたら記録の更新をコミットに含める
import fs from "node:fs";
import { test } from "vitest";
import { eventsOf, promptRecord, sendAndWait, untilIdle } from "@/features/chat/core/testing";
import { matchRecord } from "@/foundation/core/testing/record";
import { setup } from "@/app/core/testing/testServer";

test("AI への指示の文の記録: subagent-ask", async () => {
  const ctx = setup();
  ctx.provider.emits = [
    { type: "tool_use", id: "tu1", name: "Agent", input: { description: "調査", prompt: "src の構成を調べて", subagent_type: "Explore" } },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "調査", status: "running" },
    { type: "subagent", task_id: "a1", tool_use_id: "tu1", description: "", status: "completed", summary: "見つけたのは 3 件" },
    { type: "tool_result", tool_use_id: "tu1", content: "見つけたのは 3 件", is_error: false },
  ];
  const parentId = await sendAndWait(ctx, { projectId: ctx.project.id, text: "親の質問" });
  ctx.provider.emits = [];
  ctx.provider.subagentLogs.a1 = [
    { kind: "user", text: "src の構成を調べて" },
    { kind: "assistant", text: "見ていきます。" },
    { kind: "tool", name: "Bash", input: { command: "ls src" }, result: "core\nrenderer", isError: false },
    { kind: "user", text: "テストも見て" },
  ];
  const child = (await ctx.api("POST /api/chats/:chatId/subagents/:agentId/children", { params: { chatId: parentId, agentId: "a1" }, body: { text: "core には何がある？" } })).body;
  await untilIdle(ctx, child.id);
  const user = (await eventsOf(ctx, child.id, { types: ["user"] }))[0];
  const file = user?.type === "user" ? await ctx.uploads.resolve(user.data.attachments![0].id) : null;
  await matchRecord(
    "__snapshots__/prompts.subagent-ask.txt",
    promptRecord({ prompt: ctx.provider.prompts.at(-1), turnContext: ctx.provider.lastTurnContext, 添付: file ? fs.readFileSync(file.path, "utf8") : null }, [parentId, child.id]),
  );
});
