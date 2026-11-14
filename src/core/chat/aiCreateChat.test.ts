// チャットの AI がチャット（子・兄弟・親のないチャット。ワークツリーでも）を作るツールの中身（設定・世代・深さ・回数・承認・作ったチャット）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { createdChatIdOf } from "@shared/chat/aiCreateChat";
import type { Chat } from "@shared/types";
import type { ProviderTurnParams } from "../providers/types.js";
import { ScriptedProvider } from "../testing/fakeProvider.js";
import { gitRepo } from "../testing/gitRepo.js";
import { setupCore, until } from "../testing/testCore.js";
import type { AiCreateChatDecision, AiCreateChatRequest, AiCreateChatTools } from "./aiCreateChat.js";
import { canCreateChat, chatDepth } from "./aiCreateChat.js";

/** すぐ終わる偽のプロバイダーで組み立てる */
function setup() {
  const provider = new ScriptedProvider(async (params) => ({ status: "completed", sessionId: "s", turns: 1, result: params.prompt }));
  return setupCore(provider);
}
type Ctx = ReturnType<typeof setup>;

/** 1 回送って終わったチャットと、その実行に渡したもの */
async function finishedTurn(ctx: Ctx, text = "親の依頼", extra: { parentChatId?: number; worktreePath?: string } = {}): Promise<{ chatId: number; params: ProviderTurnParams }> {
  const chat = await ctx.runner.start({ projectId: ctx.project.id, prompt: text, ...extra });
  await until(() => ctx.store.chats.get(chat.id)?.status === "completed");
  return { chatId: chat.id, params: ctx.provider.calls.at(-1)! };
}

/** 聞いた中身を覚え、決めた答えを返す承認 */
function approver(decision: AiCreateChatDecision) {
  const asked: AiCreateChatRequest[] = [];
  return { asked, approve: async (request: AiCreateChatRequest) => (asked.push(request), decision) };
}
const allow = async (): Promise<AiCreateChatDecision> => ({ action: "allow" });

/** 作ったチャット（結果の印から）。動き終わるまで待つ */
async function created(ctx: Ctx, result: string): Promise<Chat> {
  const id = createdChatIdOf(result);
  assert.ok(id !== null, "結果に作ったチャットの印がある");
  await until(() => !ctx.runner.isBusy(id));
  return ctx.store.chats.get(id)!;
}

test("チャットを作るツール: 子チャットは、承認されたら呼んだチャットの子に作り、いまの作業のもとの発言を聞いた位置にする（既定は引き継ぐ）", async () => {
  const ctx = setup();
  const { chatId, params } = await finishedTurn(ctx);
  assert.ok(params.createChat, "親のないチャットにはツールを渡す");
  const { asked, approve } = approver({ action: "allow" });
  const result = await params.createChat.create({ relation: "child", text: "  ログの形式を調べて  ", title: "ログの調査" }, approve);
  // 既定は「毎回聞く」。聞く中身は、前後の空白を除いた依頼・名前・引き継ぐか（子は既定で引き継ぐ）・作業場所
  assert.deepEqual(asked, [{ relation: "child", text: "ログの形式を調べて", title: "ログの調査", inherit: true, group: null, worktree_branch: null, workplace: "このチャットと同じ作業場所（本体）" }]);
  // 偽のプロバイダーは会話を写せない（fork がない）ので、引き継げなかったことを伝える
  assert.match(result, /引き継げなかった/);
  const child = await created(ctx, result);
  assert.equal(child.parent_chat_id, chatId);
  assert.equal(child.parent_event_id, ctx.store.events.latestUserId(chatId));
  assert.equal(child.title, "ログの調査");
  assert.equal(ctx.store.chats.aiGeneration(child.id), 1, "AI が作ったチャットは 1 世代目");
  const user = ctx.store.events.list(child.id).find((e) => e.type === "user");
  assert.equal(user?.type === "user" && user.data.text, "ログの形式を調べて");
});

test("チャットを作るツール: 兄弟チャットは呼んだチャットの親の子に作り、どこから作ったかのお知らせを残す（既定は引き継がない）", async () => {
  const ctx = setup();
  const { chatId: rootId } = await finishedTurn(ctx, "根");
  const { chatId: childId, params } = await finishedTurn(ctx, "子", { parentChatId: rootId });
  const { asked, approve } = approver({ action: "allow" });
  const result = await params.createChat!.create({ relation: "sibling", text: "別の観点で調べて", title: "別の観点" }, approve);
  assert.equal(asked[0].inherit, false);
  assert.match(result, /兄弟チャット「別の観点」（このチャットと同じ親の子）を作り/);
  assert.match(result, /会話を引き継がずに/);
  const sibling = await created(ctx, result);
  assert.equal(sibling.parent_chat_id, rootId);
  assert.equal(sibling.parent_event_id, null, "親の発言から聞いたのではないので札の位置はない");
  const notice = ctx.store.events.list(sibling.id).find((e) => e.type === "notice");
  assert.equal(notice?.type === "notice" && notice.data.message, "チャット「子」から作りました（会話は引き継いでいません）");
  assert.ok(ctx.store.chats.descendants(childId).length === 0, "呼んだチャットの子にはしない");
});

test("チャットを作るツール: 親のないチャットは一覧に並べ、group_id のグループに入れる。親のないチャットからは兄弟を作れない", async () => {
  const ctx = setup();
  const { params } = await finishedTurn(ctx);
  const group = ctx.store.groups.create(ctx.project.id, "調べもの");
  await assert.rejects(params.createChat!.create({ relation: "sibling", text: "x" }, allow), /親がないので、兄弟チャットは作れません/);
  await assert.rejects(params.createChat!.create({ relation: "child", text: "x", group_id: group.id }, allow), /親のないチャット.*だけ/);
  const other = ctx.store.projects.create({ name: "別", repo_path: ctx.project.repo_path + "-other", provider: "claude" });
  const foreign = ctx.store.groups.create(other.id, "よそ");
  await assert.rejects(params.createChat!.create({ relation: "root", text: "x", group_id: foreign.id }, allow), /このプロジェクトにありません/);
  const result = await params.createChat!.create({ relation: "root", text: "新しい話題", title: "新しい話題", group_id: group.id }, allow);
  assert.match(result, /家系の外/);
  const root = await created(ctx, result);
  assert.equal(root.parent_chat_id, null);
  assert.equal(root.group_id, group.id);
  assert.equal(root.worktree_path, null);
});

test("チャットを作るツール: 断られたら作らず、理由を AI に返す", async () => {
  const ctx = setup();
  const { chatId, params } = await finishedTurn(ctx);
  const { approve } = approver({ action: "deny", message: "いまは要らない" });
  await assert.rejects(params.createChat!.create({ relation: "child", text: "調べて" }, approve), /利用者が断りました: いまは要らない/);
  assert.equal(ctx.store.chats.descendants(chatId).length, 0);
});

test("チャットを作るツール: 「常に許可」で設定を「聞かずに作る」にし、次からは聞かない", async () => {
  const ctx = setup();
  const { params } = await finishedTurn(ctx);
  const always = approver({ action: "allow_always" });
  const first = await params.createChat!.create({ relation: "child", text: "1 つ目", inherit: false }, always.approve);
  assert.equal(ctx.store.settings.get().ai_create_chat, "allow");
  const next = approver({ action: "deny", message: null });
  const second = await params.createChat!.create({ relation: "root", text: "2 つ目" }, next.approve);
  assert.equal(next.asked.length, 0, "聞かずに作る");
  await created(ctx, first);
  await created(ctx, second);
});

test("チャットを作るツール: 「作らせない」ならツールを渡さず、作業の途中で変えても次の呼び出しから断る", async () => {
  const ctx = setup();
  const { params } = await finishedTurn(ctx);
  ctx.store.settings.update({ ai_create_chat: "off" });
  const { asked, approve } = approver({ action: "allow" });
  await assert.rejects(params.createChat!.create({ relation: "child", text: "調べて" }, approve), /止めています/);
  assert.equal(asked.length, 0);
  const { params: offParams } = await finishedTurn(ctx, "次の依頼");
  assert.equal(offParams.createChat, null);
});

test("チャットを作るツール: 子チャットは孫チャットまで（孫からは兄弟・親のないチャットだけ）。AI が作った世代は 2 世代目まで", async () => {
  const ctx = setup();
  const { store, project } = ctx;
  const base = { project_id: project.id, provider: "claude" as const, status: "completed" as const, title: "c" };
  const root = store.chats.create({ ...base, parent_chat_id: null });
  const child = store.chats.create({ ...base, parent_chat_id: root.id });
  const grandchild = store.chats.create({ ...base, parent_chat_id: child.id });
  assert.deepEqual([root, child, grandchild].map((c) => chatDepth(store, c)), [0, 1, 2]);
  // 深さではツールを止めない（孫も兄弟・親のないチャットは作れる）。止めるのは世代
  assert.deepEqual([root, child, grandchild].map((c) => canCreateChat(store, c)), [true, true, true]);
  const second = store.chats.create({ ...base, parent_chat_id: null, ai_generation: 2 });
  assert.equal(canCreateChat(store, second), false, "2 世代目にはツールを渡さない");

  // 孫チャットの実行に渡したツールで、子チャットは断り、兄弟は作れる
  const { params } = await finishedTurn(ctx, "孫の依頼", { parentChatId: child.id });
  await assert.rejects(params.createChat!.create({ relation: "child", text: "x" }, allow), /孫チャットまで/);
  const sibling = await created(ctx, await params.createChat!.create({ relation: "sibling", text: "兄弟" }, allow));
  assert.equal(sibling.parent_chat_id, child.id);

  // 1 世代目のチャットが作ると 2 世代目、その中からは作れない（作業の途中で世代が上がることはないが、呼ぶたびに確かめる）
  const { params: genParams } = await finishedTurn(ctx, "1 世代目から");
  const gen1 = await created(ctx, await genParams.createChat!.create({ relation: "root", text: "1 世代目" }, allow));
  const gen1Params = await turnOf(ctx, gen1.id);
  const gen2 = await created(ctx, await gen1Params.createChat!.create({ relation: "root", text: "2 世代目" }, allow));
  assert.equal(store.chats.aiGeneration(gen2.id), 2);
  const gen2Params = await turnOf(ctx, gen2.id);
  assert.equal(gen2Params.createChat, null, "2 世代目のチャットの AI にはツールを渡さない");
});

/** チャットにもう 1 回送り、その実行に渡したもの */
async function turnOf(ctx: Ctx, chatId: number): Promise<ProviderTurnParams & { createChat?: AiCreateChatTools | null }> {
  await ctx.runner.send(chatId, "続き");
  await until(() => !ctx.runner.isBusy(chatId) && ctx.provider.calls.at(-1)?.prompt.includes("続き") === true);
  return ctx.provider.calls.at(-1)!;
}

test("チャットを作るツール: 1 回の作業で作れるのは 5 つまで", async () => {
  const ctx = setup();
  const { params } = await finishedTurn(ctx);
  for (let i = 0; i < 5; i++) await created(ctx, await params.createChat!.create({ relation: "root", text: `${i}` }, allow));
  await assert.rejects(params.createChat!.create({ relation: "root", text: "6 つ目" }, allow), /5 つまで/);
  // 次の作業ではまた作れる
  const { params: next } = await finishedTurn(ctx, "次");
  await created(ctx, await next.createChat!.create({ relation: "root", text: "次の作業" }, allow));
});

test("チャットを作るツール: worktree_branch で、呼んだチャットの作業場所のいまのコミットから新しいワークツリーを作り、そこで動かす", async () => {
  const ctx = setup();
  const { git } = gitRepo({ dir: ctx.project.repo_path, files: { "a.txt": "1" } });
  const { chatId, params } = await finishedTurn(ctx);
  // まだコミットしていない変更は入らない
  fs.writeFileSync(path.join(ctx.project.repo_path, "a.txt"), "書きかけ");
  const head = git("rev-parse", "HEAD").trim();
  const { asked, approve } = approver({ action: "allow" });
  // 名前に使えない・同じ名前のブランチは、聞く前に断る
  await assert.rejects(params.createChat!.create({ relation: "child", text: "x", worktree_branch: "bad..name" }, approve), /使えない文字/);
  await assert.rejects(params.createChat!.create({ relation: "child", text: "x", worktree_branch: "main" }, approve), /同じ名前のブランチ/);
  assert.equal(asked.length, 0);
  const result = await params.createChat!.create({ relation: "child", text: "実装して", worktree_branch: "feat/a" }, approve);
  assert.match(asked[0].workplace, /新しいワークツリー（ブランチ feat\/a/);
  assert.match(result, /ブランチ feat\/a/);
  assert.match(result, /まだコミットしていない変更（1 ファイル）は、新しいワークツリーに入っていません/);
  const child = await created(ctx, result);
  assert.equal(child.parent_chat_id, chatId);
  assert.ok(child.worktree_path?.endsWith(path.join("repo-worktrees", "feat-a")));
  assert.equal(fs.readFileSync(path.join(child.worktree_path!, "a.txt"), "utf8"), "1");
  assert.equal(git("rev-parse", "feat/a").trim(), head);
  // 同じフォルダにもう 1 つは作れない
  await assert.rejects(params.createChat!.create({ relation: "child", text: "x", worktree_branch: "feat/a" }, approve), /同じ名前のブランチ/);
});

test("チャットを作るツール: Git でないプロジェクトではワークツリーを作れない", async () => {
  const ctx = setup();
  const { params } = await finishedTurn(ctx);
  await assert.rejects(params.createChat!.create({ relation: "root", text: "x", worktree_branch: "feat/a" }, allow), /Git で管理していない/);
});
