// AI がほかのプロジェクト（共通を含む）へ移す予約: move_workplace の project。作業が最後まで終わったら、画面の「プロジェクトを変更」と同じく
// 子チャットも一緒に移った先の本体（共通なら作業フォルダ）へ移す。共通のチャットから利用者のプロジェクトへは、設定「共通のチャットがほかのプロジェクトに書くとき」に従って聞く
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { busyTurn, continuations, mainChat } from "@/features/workplaceMove/core/testing";
import { chatOf, sendAndWait, untilIdle } from "@/features/chat/core/testing";

/** 共通のプロジェクト（作業フォルダはプロジェクトの外） */
function commonOf(ctx: ReturnType<typeof setup>) {
  const work = path.join(path.dirname(ctx.project.repo_path), `${path.basename(ctx.project.repo_path)}-common-work`);
  fs.mkdirSync(work, { recursive: true });
  return ctx.store.projects.create({ name: "共通", repo_path: work, provider: "claude", kind: "common" });
}

/** 聞かれた数を数えて、決めた答えを返す承認 */
function counter(answer: boolean) {
  const asked: unknown[] = [];
  return { asked, ask: async (input: unknown) => (asked.push(input), answer) };
}

test("プロジェクトのチャットは、聞かずに共通へ移る予約ができ、作業が終わったら子チャットごと共通の作業フォルダへ移って続きを送る", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees", "childChats"] });
  const { store, project } = ctx;
  const chatId = await mainChat(ctx);
  const common = commonOf(ctx);
  const child = await sendAndWait(ctx, { projectId: project.id, parentChatId: chatId, text: "子" });
  const { tools, release } = await busyTurn(ctx, chatId);
  const never = counter(false);
  // ほかのプロジェクトへは to: main だけ
  await assert.rejects(tools.move({ to: "new_worktree", branch: "feat/x", project: "共通" }, never.ask), /to: main だけ/);
  await assert.rejects(tools.move({ to: "main", project: project.name }, never.ask), /もうプロジェクト/);
  await assert.rejects(tools.move({ to: "main", project: "ない" }, never.ask), /見つかりません/);
  assert.match(await tools.move({ to: "main", project: "共通", continuation: "共通で調べる" }, never.ask), /共通へ移し、続きの指示を送ります/);
  assert.equal(never.asked.length, 0);
  release();
  await until(async () => (await continuations(ctx, chatId)).length === 1);
  await untilIdle(ctx, chatId);
  const moved = await chatOf(ctx, chatId);
  assert.deepEqual([moved.project_id, moved.worktree_path], [common.id, null]);
  assert.equal(store.chats.get(child)?.project_id, common.id);
});

test("共通のチャットから利用者のプロジェクトへ移すのは、設定に従って聞く（書かせないなら聞かずに断る。子チャットからは移せない）", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees", "childChats"] });
  const { store, project } = ctx;
  await mainChat(ctx);
  const common = commonOf(ctx);
  const chatId = await sendAndWait(ctx, { projectId: common.id, text: "相談" });
  const childId = await sendAndWait(ctx, { projectId: common.id, parentChatId: chatId, text: "子" });
  // 子チャットからは移せない
  const childTurn = await busyTurn(ctx, childId);
  await assert.rejects(childTurn.tools.move({ to: "main", project: project.name }, counter(true).ask), /子チャットはほかのプロジェクトへ移せません/);
  childTurn.release();
  await untilIdle(ctx, childId);
  // 書かせない → 聞かずに断る
  store.settings.update({ ai_write_other_projects: "off" });
  const first = await busyTurn(ctx, chatId);
  const off = counter(true);
  await assert.rejects(first.tools.move({ to: "main", project: project.name }, off.ask), /書くのを止めています/);
  assert.equal(off.asked.length, 0);
  // 毎回聞く → 断れば予約しない
  store.settings.update({ ai_write_other_projects: "ask" });
  const denied = counter(false);
  await assert.rejects(first.tools.move({ to: "main", project: project.name }, denied.ask), /利用者が断りました/);
  assert.equal(denied.asked.length, 1);
  // 許せば予約し、作業が終わったらプロジェクトの本体へ移る
  const allowed = counter(true);
  assert.match(await first.tools.move({ to: "main", project: project.name }, allowed.ask), new RegExp(`プロジェクト「${project.name}」へ移します`));
  first.release();
  await until(async () => (await chatOf(ctx, chatId)).project_id === project.id);
  await untilIdle(ctx, chatId);
  assert.deepEqual([(await chatOf(ctx, chatId)).worktree_path, store.chats.get(childId)?.project_id], [null, project.id]);
});
