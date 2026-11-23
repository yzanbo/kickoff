// AI が作業場所を移す予約: move_workplace は予約だけして、作業が最後まで終わったら
// Kickoff が移して続きを送る。送信待ちを止めていれば続きは先頭に入れる、移せなければ知らせて続きは送らない、
// 止めた作業では移さない、画面・スマホ・AI から取り消せる、持っていくときだけ承認を聞く（片付けの予約と重なるときは src/app/core/scenarios/workplaceReservation.test.ts）
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { setup, until } from "@/app/core/testing/testServer";
import { gitIn } from "@/foundation/core/testing/gitRepo";
import { allowCarry as allow, busyTurn, continuations, mainChat } from "@/features/workplaceMove/core/testing";
import { chatOf, eventsOf, isBusy, liveOf, noticesOf, untilIdle } from "@/features/chat/core/testing";

test("予約は作業中の様子に出し、作業が終わったら新しいワークツリーへ移して続きを送る。続きは送信待ちより先", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees"] });
  const { call, provider } = ctx;
  const chatId = await mainChat(ctx);
  const { tools, release } = await busyTurn(ctx, chatId);
  const answer = await tools.move({ to: "new_worktree", branch: "feat/ai", continuation: "feat/ai で a.txt を直す" }, allow);
  assert.match(answer, /予約しました。この作業が最後まで終わったら、Kickoff がこのチャットを新しいワークツリー（feat\/ai）へ移し、続きの指示を送ります/);
  assert.deepEqual((await liveOf(ctx, chatId)).workplace_move, { label: "新しいワークツリー（feat/ai）", carry: false, continuation: true });
  await call("POST", `/api/chats/${chatId}/messages`, { text: "利用者の次の指示", when: "later" });
  release();
  await until(async () => (await continuations(ctx, chatId)).length === 1 && !(await isBusy(ctx, chatId)) && (await chatOf(ctx, chatId)).status === "completed" && provider.prompts.at(-1) === "利用者の次の指示");
  const chat = await chatOf(ctx, chatId);
  assert.ok(chat.worktree_path?.endsWith("feat-ai"));
  const moved = (await eventsOf(ctx, chatId)).findLast((e) => e.type === "workplace_moved");
  assert.equal(moved?.type === "workplace_moved" ? moved.data.reason : null, "ai");
  // 続き → 送信待ちの順に送る
  const at = provider.prompts.indexOf("feat/ai で a.txt を直す");
  assert.ok(at >= 0 && at < provider.prompts.indexOf("利用者の次の指示"));
  assert.equal((await liveOf(ctx, chatId)).workplace_move, null);
});

test("同じ作業で頼み直すと最後のものだけ残す。画面から取り消すと移さず、お知らせを残す（予約がなければ 409）。AI も取り消せる", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees"] });
  const { call } = ctx;
  const chatId = await mainChat(ctx);
  const wt = ((await call("POST", `/api/projects/${ctx.project.id}/git/worktrees`, { branch: "feat/x" })).body as { path: string; main: boolean }[]).find((w) => !w.main)!.path;
  const { tools, release } = await busyTurn(ctx, chatId);
  await tools.move({ to: "new_worktree", branch: "feat/first" }, allow);
  assert.match(await tools.move({ to: "worktree", worktree: "feat/x" }, allow), /前の予約を置き換えて、予約しました/);
  assert.equal((await liveOf(ctx, chatId)).workplace_move!.label, "ワークツリー（feat/x）");
  assert.equal(await tools.cancel(), "作業場所を移す予約を取り消しました。");
  assert.match(await tools.cancel(), /取り消す予約はありません/);
  await tools.move({ to: "worktree", worktree: wt }, allow);
  assert.equal((await call("DELETE", `/api/chats/${chatId}/workplace-move`)).status, 204);
  assert.equal((await call("DELETE", `/api/chats/${chatId}/workplace-move`)).status, 409);
  assert.ok((await noticesOf(ctx, chatId)).some((m) => m === "AI が予約した「ワークツリー（feat/x）へ移る」を取り消しました"));
  release();
  await untilIdle(ctx, chatId);
  assert.equal((await chatOf(ctx, chatId)).worktree_path, null);
});

test("止めた作業では移さず、予約を消して知らせる", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees"] });
  const { call } = ctx;
  const chatId = await mainChat(ctx);
  const { tools } = await busyTurn(ctx, chatId);
  await tools.move({ to: "new_worktree", branch: "feat/stop", continuation: "続き" }, allow);
  await call("POST", `/api/chats/${chatId}/cancel`, {});
  await until(async () => !(await isBusy(ctx, chatId)) && (await noticesOf(ctx, chatId)).some((m) => m.includes("作業が最後まで終わらなかったので")));
  assert.equal((await chatOf(ctx, chatId)).worktree_path, null);
  assert.deepEqual((await continuations(ctx, chatId)), []);
  assert.equal(gitIn(ctx.project.repo_path)("branch", "--list", "feat/stop").trim(), "");
});

test("送信待ちを止めていれば、移すが続きは送らずに送信待ちの先頭に入れる（G5）", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees"] });
  const { call, provider } = ctx;
  const chatId = await mainChat(ctx);
  const { tools, release } = await busyTurn(ctx, chatId);
  await tools.move({ to: "new_worktree", branch: "feat/paused", continuation: "続きの指示" }, allow);
  await call("POST", `/api/chats/${chatId}/messages`, { text: "待っている指示", when: "later" });
  await call("POST", `/api/chats/${chatId}/queue`, { commands: [{ op: "set_paused", paused: true }] });
  const sent = provider.prompts.length;
  release();
  await until(async () => !(await isBusy(ctx, chatId)) && (await chatOf(ctx, chatId)).worktree_path !== null && (await noticesOf(ctx, chatId)).some((m) => m.includes("送信待ちの先頭")));
  const queue = (await liveOf(ctx, chatId)).queue;
  assert.deepEqual(
    queue.messages.map((m: { text: string; workplace_continuation?: true }) => [m.text, m.workplace_continuation ?? false]),
    [
      ["続きの指示", true],
      ["待っている指示", false],
    ],
  );
  assert.equal(provider.prompts.length, sent);
});

test("移せなければ元のまま、知らせて続きは送らない（G6）", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees"] });
  const { provider } = ctx;
  const chatId = await mainChat(ctx);
  const { tools, release } = await busyTurn(ctx, chatId);
  await tools.move({ to: "new_worktree", branch: "feat/broken", continuation: "続き" }, allow);
  provider.copyError = "壊れています";
  release();
  await until(async () => !(await isBusy(ctx, chatId)) && (await noticesOf(ctx, chatId)).some((m) => m.includes("AI が予約した「新しいワークツリー（feat/broken）へ移る」ができませんでした")));
  assert.equal((await chatOf(ctx, chatId)).worktree_path, null);
  assert.deepEqual((await continuations(ctx, chatId)), []);
  assert.equal(gitIn(ctx.project.repo_path)("branch", "--list", "feat/broken").trim(), "");
});

test("ツールの確かめ: 持っていくのは新しいワークツリーだけ・同じ場所は断る。持っていくときだけファイルの一覧で承認を聞き、断られたら予約しない", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees"] });
  const { call, project } = ctx;
  const chatId = await mainChat(ctx);
  await call("POST", `/api/projects/${project.id}/git/worktrees`, { branch: "feat/y" });
  const { tools, release } = await busyTurn(ctx, chatId);
  await assert.rejects(tools.move({ to: "worktree", worktree: "feat/y", carry: true }, allow), /新しいワークツリーへ移すときだけ/);
  await assert.rejects(tools.move({ to: "main" }, allow), /いまと同じ作業場所です/);
  await assert.rejects(tools.move({ to: "worktree", worktree: "nope" }, allow), /ワークツリー「nope」が見つかりません。いまあるワークツリー: feat\/y/);
  // 変更がなければ聞かない
  let asked: string[] | null = null;
  await tools.move({ to: "new_worktree", branch: "feat/clean", carry: true }, async (r) => ((asked = r.files), true));
  assert.equal(asked, null);
  fs.writeFileSync(path.join(project.repo_path, "a.txt"), "changed\n");
  await assert.rejects(
    tools.move({ to: "new_worktree", branch: "feat/carry", carry: true }, async (r) => ((asked = r.files), false)),
    /利用者が変更を持っていくのを断った/,
  );
  assert.deepEqual(asked, ["a.txt"]);
  assert.equal((await liveOf(ctx, chatId)).workplace_move!.carry, false);
  release();
});

test("利用者が取り消したことは AI にも伝える: 作業中で足せればその場で、足せなければ次の指示に一度だけ添える", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees"] });
  const { call, provider } = ctx;
  const chatId = await mainChat(ctx);
  // 足せる: いまの作業にその場で足す（次の指示には添えない）
  const first = await busyTurn(ctx, chatId);
  await first.tools.move({ to: "new_worktree", branch: "feat/told" }, allow);
  assert.equal((await call("DELETE", `/api/chats/${chatId}/workplace-move`)).status, 204);
  assert.ok(provider.told.some((t) => t.includes("利用者が、あなたが予約した作業場所の移動（新しいワークツリー（feat/told）へ）を取り消しました")));
  first.release();
  await untilIdle(ctx, chatId);
  await call("POST", `/api/chats/${chatId}/messages`, { text: "次" });
  await until(async () => !(await isBusy(ctx, chatId)) && provider.prompts.at(-1) === "次");
  assert.doesNotMatch(provider.lastTurnContext ?? "", /取り消しました/);

  // 足せない（入力を閉じた）: 新しく動かさず、次の指示の文脈に一度だけ添える
  const second = await busyTurn(ctx, chatId);
  await second.tools.move({ to: "new_worktree", branch: "feat/later" }, allow);
  provider.acceptTell = false;
  const told = provider.told.length;
  assert.equal((await call("DELETE", `/api/chats/${chatId}/workplace-move`)).status, 204);
  assert.equal(provider.told.length, told);
  second.release();
  await untilIdle(ctx, chatId);
  const sent = provider.prompts.length;
  await call("POST", `/api/chats/${chatId}/messages`, { text: "その次" });
  await until(async () => !(await isBusy(ctx, chatId)) && provider.prompts.length === sent + 1);
  assert.match(provider.lastTurnContext ?? "", /新しいワークツリー（feat\/later）へ）を取り消しました/);
  await call("POST", `/api/chats/${chatId}/messages`, { text: "さらに次" });
  await until(async () => !(await isBusy(ctx, chatId)) && provider.prompts.at(-1) === "さらに次");
  assert.doesNotMatch(provider.lastTurnContext ?? "", /取り消しました/);
});

test("足せなかった取り消しの知らせは、次に伝えた発言の頭にも一度だけ添える", async () => {
  const ctx = setup({ features: ["workplaceMove", "worktrees"] });
  const { call, provider } = ctx;
  const chatId = await mainChat(ctx);
  const { tools, release } = await busyTurn(ctx, chatId);
  await tools.move({ to: "new_worktree", branch: "feat/tell" }, allow);
  provider.acceptTell = false;
  await call("DELETE", `/api/chats/${chatId}/workplace-move`);
  // 入力がまた受け付けるようになってから、利用者が伝えた発言に添わる
  provider.acceptTell = true;
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "ついでに", when: "now" })).body.result, "told");
  assert.match(provider.told.at(-1) ?? "", /取り消しました。[\s\S]*\n\nついでに$/);
  assert.equal((await call("POST", `/api/chats/${chatId}/messages`, { text: "もう一つ", when: "now" })).body.result, "told");
  assert.equal(provider.told.at(-1), "もう一つ");
  release();
  await untilIdle(ctx, chatId);
});
