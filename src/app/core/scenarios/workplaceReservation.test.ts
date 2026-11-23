// 機能をまたぐ筋書き: AI の作業場所の移動の予約（workplaceMove）× ワークツリーの片付けの予約（worktrees）× 作業の終わりにすること・送信待ち（chat）。
// 両方を予約したら先に片付け、本体へなら移すのは片付けで済み、続きは送るが送信待ちは止めたまま
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { chatOf, isBusy, liveOf } from "@/features/chat/core/testing";
import { allowCarry as allow, busyTurn, continuations, mainChat } from "@/features/workplaceMove/core/testing";

test("片付けの予約と重なれば先に片付ける。本体へなら移すのは片付けで済み、続きは送るが送信待ちは止めたまま（G4・J3）", async () => {
  const ctx = setup();
  const { call, worktreeFinisher, provider } = ctx;
  const chatId = await mainChat(ctx);
  const wt = ((await call("POST", `/api/projects/${ctx.project.id}/git/worktrees`, { branch: "feat/done" })).body as { path: string; main: boolean }[]).find((w) => !w.main)!.path;
  await call("POST", `/api/chats/${chatId}/workplace`, { worktree_path: wt });
  const { tools, release } = await busyTurn(ctx, chatId);
  assert.match(await worktreeFinisher.finishFromChat(chatId, undefined), /予約しました/);
  // 片付けを予約したワークツリーからは変更を持っていけない（取り消す口はないので、持っていかずに移すよう案内する。6 章 B4）
  await assert.rejects(tools.move({ to: "new_worktree", branch: "feat/next", carry: true }, allow), /片付けの予約は取り消せません）。持っていかずに移してください/);
  assert.match(await tools.move({ to: "main", continuation: "本体で続ける" }, allow), /先に片付けます/);
  await call("POST", `/api/chats/${chatId}/messages`, { text: "あとの指示", when: "later" });
  release();
  await until(async () => !(await isBusy(ctx, chatId)) && (await continuations(ctx, chatId)).length === 1 && (await chatOf(ctx, chatId)).status === "completed");
  assert.equal((await chatOf(ctx, chatId)).worktree_path, null);
  assert.equal(fs.existsSync(wt), false);
  assert.ok(provider.prompts.includes("本体で続ける"));
  assert.ok(!provider.prompts.includes("あとの指示"));
  assert.equal((await liveOf(ctx, chatId)).queue.paused, true);
});
