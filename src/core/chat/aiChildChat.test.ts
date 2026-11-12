// チャットの AI が自分の子チャットを作るツールの中身（設定・深さ・承認・作った子チャット）
import assert from "node:assert/strict";
import { test } from "node:test";
import { childChatIdOf } from "@shared/chat/aiChildChat";
import type { ProviderTurnParams } from "../providers/types.js";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { setupCore, until } from "../testing/testCore.js";
import type { AiChildChatDecision, AiChildChatRequest } from "./aiChildChat.js";
import { canCreateChildChat, chatDepth } from "./aiChildChat.js";

/** すぐ終わる偽のプロバイダーで組み立てる */
function setup() {
  const provider = new ScriptedProvider(async (params) => ({ status: "completed", sessionId: "s", turns: 1, result: params.prompt }));
  return setupCore(provider);
}

/** 1 回送って終わったチャットと、その実行に渡したもの */
async function finishedTurn(ctx: ReturnType<typeof setup>, text = "親の依頼"): Promise<{ chatId: number; params: ProviderTurnParams }> {
  const chat = await ctx.runner.start({ projectId: ctx.project.id, prompt: text });
  await until(() => ctx.store.chats.get(chat.id)?.status === "completed");
  return { chatId: chat.id, params: ctx.provider.calls.at(-1)! };
}

/** 聞いた中身を覚え、決めた答えを返す承認 */
function approver(decision: AiChildChatDecision) {
  const asked: AiChildChatRequest[] = [];
  return { asked, approve: async (request: AiChildChatRequest) => (asked.push(request), decision) };
}

test("子チャットのツール: 承認されたら、ツールを呼んだチャットの子チャットを作り、いまの作業のもとの発言を聞いた位置にする", async () => {
  const ctx = setup();
  const { chatId, params } = await finishedTurn(ctx);
  assert.ok(params.childChat, "親のないチャットにはツールを渡す");
  const { asked, approve } = approver({ action: "allow" });
  const result = await params.childChat.create({ text: "  ログの形式を調べて  ", title: "ログの調査" }, approve);
  // 既定は「毎回聞く」。聞く中身は、前後の空白を除いた依頼・名前・引き継ぐか（既定は引き継ぐ）
  assert.deepEqual(asked, [{ text: "ログの形式を調べて", title: "ログの調査", inherit: true }]);
  // 偽のプロバイダーは会話を写せない（fork がない）ので、引き継げなかったことを伝える
  assert.match(result, /引き継げなかった/);
  const childId = childChatIdOf(result);
  assert.ok(childId !== null, "結果に作った子チャットの印がある");
  const child = ctx.store.chats.get(childId)!;
  assert.equal(child.parent_chat_id, chatId);
  assert.equal(child.parent_event_id, ctx.store.events.latestUserId(chatId));
  assert.equal(child.title, "ログの調査");
  const user = ctx.store.events.list(childId).find((e) => e.type === "user");
  assert.equal(user?.type === "user" && user.data.text, "ログの形式を調べて");
  await until(() => !ctx.runner.isBusy(childId));
});

test("子チャットのツール: 断られたら作らず、理由を AI に返す", async () => {
  const ctx = setup();
  const { chatId, params } = await finishedTurn(ctx);
  const { approve } = approver({ action: "deny", message: "いまは要らない" });
  await assert.rejects(params.childChat!.create({ text: "調べて" }, approve), /利用者が断りました: いまは要らない/);
  assert.equal(ctx.store.chats.descendants(chatId).length, 0);
});

test("子チャットのツール: 「常に許可」で設定を「聞かずに作る」にし、次からは聞かない", async () => {
  const ctx = setup();
  const { params } = await finishedTurn(ctx);
  const always = approver({ action: "allow_always" });
  const first = childChatIdOf(await params.childChat!.create({ text: "1 つ目", inherit: false }, always.approve));
  assert.equal(ctx.store.settings.get().ai_child_chat, "allow");
  const next = approver({ action: "deny", message: null });
  const second = childChatIdOf(await params.childChat!.create({ text: "2 つ目", inherit: false }, next.approve));
  assert.equal(next.asked.length, 0, "聞かずに作る");
  assert.ok(first !== null && second !== null);
  await until(() => !ctx.runner.isBusy(first) && !ctx.runner.isBusy(second));
});

test("子チャットのツール: 「作らせない」ならツールを渡さず、作業の途中で変えても次の呼び出しから断る", async () => {
  const ctx = setup();
  const { params } = await finishedTurn(ctx);
  ctx.store.settings.update({ ai_child_chat: "off" });
  const { asked, approve } = approver({ action: "allow" });
  await assert.rejects(params.childChat!.create({ text: "調べて" }, approve), /止めています/);
  assert.equal(asked.length, 0);
  const { params: offParams } = await finishedTurn(ctx, "次の依頼");
  assert.equal(offParams.childChat, null);
});

test("子チャットのツール: 作れるのは孫チャットまで（孫チャットにはツールを渡さない）", () => {
  const { store, project } = setup();
  const base = { project_id: project.id, provider: "claude" as const, status: "completed" as const, model: null, effort: null, permission_mode: "default" as const, fast_mode: false, group_id: null, worktree_path: null, parent_event_id: null, memo_path: null };
  const root = store.chats.create({ ...base, title: "根", parent_chat_id: null });
  const child = store.chats.create({ ...base, title: "子", parent_chat_id: root.id });
  const grandchild = store.chats.create({ ...base, title: "孫", parent_chat_id: child.id });
  assert.deepEqual([root, child, grandchild].map((c) => chatDepth(store, c)), [0, 1, 2]);
  assert.deepEqual([root, child, grandchild].map((c) => canCreateChildChat(store, c)), [true, true, false]);
});
