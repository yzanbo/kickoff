// 実行の受付（Runner）のテスト: 圧縮のきっかけと手で圧縮・超過分とクレジットのお知らせ
import assert from "node:assert/strict";
import { test } from "vitest";
import { ScriptedProvider, type Script } from "@/features/ai/core/testing";
import { setupCore, testUploads, until } from "@/app/core/testing/testCore";
import type { CompactingState } from "@shared/chat/chatLive";

/** 台本どおりの偽のプロバイダーで、コアを組み立てる（API のテストと同じ準備。testing/testCore.ts） */
const setup = (script: Script, uploads?: ReturnType<typeof testUploads>) => setupCore(new ScriptedProvider(script), { uploads });

test("圧縮のきっかけ: 手で圧縮した（ボタン・/compact を送った）ときは manual、ほかの指示の途中の圧縮は auto。失敗は手で圧縮したときだけお知らせに残す", async () => {
  const seen: [string, CompactingState | null][] = [];
  let chatId = 0;
  const { store, runner, project } = setup(async (params, cb) => {
    // 作ったチャットの ID を受け取ってから動く（runner.live で様子を読むため）
    await until(() => chatId !== 0);
    cb.emit({ type: "init", session_id: "s1" });
    cb.compacting?.(true);
    seen.push([params.prompt, runner.live(chatId).compacting]);
    // 要約するものがないなど、圧縮が失敗して終わる
    cb.compacting?.(false);
    cb.compactFailed?.(params.prompt.startsWith("/compact") ? "too long" : "too_few_groups");
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1 };
  });
  const chat = await runner.start({ projectId: project.id, prompt: "続けて" });
  chatId = chat.id;
  await until(() => store.chats.get(chat.id)?.status === "completed" && !runner.isBusy(chat.id));
  await runner.message(chat.id, { text: "/compact 決めたことを残して" });
  await until(() => seen.length === 2 && !runner.isBusy(chat.id));
  await runner.compact(chat.id);
  await until(() => seen.length === 3 && !runner.isBusy(chat.id));
  assert.deepEqual(
    seen.map(([prompt, live]) => [prompt.split(" ")[0], live?.trigger]),
    [
      ["続けて", "auto"],
      ["/compact", "manual"],
      ["/compact", "manual"],
    ],
  );
  // 圧縮している間は始めた時刻を持ち、終われば消える
  assert.ok(seen.every(([, live]) => typeof live?.since === "string"));
  assert.equal(runner.live(chat.id).compacting, null);
  const notices = store.events.list(chat.id).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
  assert.deepEqual(notices, ["会話の圧縮に失敗しました（too long）", "会話の圧縮に失敗しました（too long）"]);
});

test("超過分（追加の使用枠）で動き始めたら、その作業のチャットにお知らせを 1 回だけ残す（動いている間に送った次の作業には残さない）", async () => {
  const { store, runner, project } = setup(async (params, cb) => {
    cb.emit({ type: "init", session_id: "s1" });
    if (params.prompt !== "枠の中") {
      cb.spending?.({ in_use: true });
      cb.spending?.({ in_use: true });
    } else cb.spending?.({ in_use: false });
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1 };
  });
  const notices = (chatId: number) => store.events.list(chatId).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
  const chat = await runner.start({ projectId: project.id, prompt: "超えた" });
  await until(() => store.chats.get(chat.id)?.status === "completed" && !runner.isBusy(chat.id));
  assert.deepEqual(notices(chat.id), ["Claude のプランの使用枠の上限を超えたため、ここから追加の使用枠（使った分の支払い）で動いています"]);
  // 超過分のまま次の作業: もう知らせてあるので残さない
  await runner.message(chat.id, { text: "まだ超えている" });
  await until(() => store.chats.get(chat.id)?.num_turns === 2 && !runner.isBusy(chat.id));
  assert.equal(notices(chat.id).length, 1);
  // 枠に戻ったあと、また超えたら残す
  await runner.message(chat.id, { text: "枠の中" });
  await until(() => store.chats.get(chat.id)?.num_turns === 3 && !runner.isBusy(chat.id));
  await runner.message(chat.id, { text: "また超えた" });
  await until(() => store.chats.get(chat.id)?.num_turns === 4 && !runner.isBusy(chat.id));
  assert.equal(notices(chat.id).length, 2);
});

test("Codex のクレジットの残りが減り始めたら、その作業のチャットにお知らせを 1 回だけ残す", async () => {
  const balances = [150, 142, 130];
  const { store, runner, project } = setupCore(new ScriptedProvider(async (_params, cb) => {
    cb.emit({ type: "init", session_id: "s1" });
    cb.spending?.({ has_credits: true, unlimited: false, balance: balances.shift() ?? null, limit_reached: true });
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1 };
  }));
  const notices = (chatId: number) => store.events.list(chatId).flatMap((e) => (e.type === "notice" ? [e.data.message] : []));
  const chat = await runner.start({ projectId: project.id, prompt: "初め", provider: "codex" });
  await until(() => store.chats.get(chat.id)?.status === "completed" && !runner.isBusy(chat.id));
  // 初めて見た残りでは比べる相手がないので残さない
  assert.deepEqual(notices(chat.id), []);
  await runner.message(chat.id, { text: "減った" });
  await until(() => store.chats.get(chat.id)?.num_turns === 2 && !runner.isBusy(chat.id));
  assert.deepEqual(notices(chat.id), ["Codex のプランの使用枠の上限を超えたため、ここからクレジットから引かれて動いています"]);
  // 減り続けても、もう知らせてあるので残さない
  await runner.message(chat.id, { text: "まだ減る" });
  await until(() => store.chats.get(chat.id)?.num_turns === 3 && !runner.isBusy(chat.id));
  assert.equal(notices(chat.id).length, 1);
});

test("手で圧縮すると /compact を送り、要約したことだけを残す（発言・未読・会話の回数には数えない）", async () => {
  const { store, runner, provider, project } = setup(async (params, cb) => {
    if (params.prompt === "/compact") {
      cb.emit({ type: "compact", trigger: "manual", pre_tokens: 120_000, post_tokens: 18_000 });
      // 本物のプロバイダーは、要約のあとの大きさ（post_tokens）を結果のコンテキストとして返す
      return { status: "completed", sessionId: "s1", result: "", turns: 1, context: { tokens: 18_000, window: 200_000 } };
    }
    cb.emit({ type: "init", session_id: "s1" });
    cb.emit({ type: "text", text: "ok" });
    return { status: "completed", sessionId: "s1", result: "ok", turns: 1, context: { tokens: 120_000, window: 200_000 } };
  });

  // まだ会話がないチャットは圧縮できない
  const fresh = store.chats.create({ project_id: project.id, provider: "claude", title: "t", status: "completed", model: null });
  await assert.rejects(runner.compact(fresh.id), /まだ会話がない/);

  const chat = await runner.start({ projectId: project.id, prompt: "こんにちは" });
  await until(() => store.chats.get(chat.id)?.status === "completed");
  store.chats.setUnread(chat.id, false);
  const before = store.chats.get(chat.id)!;
  const eventsBefore = store.events.list(chat.id).length;

  await runner.compact(chat.id);
  await until(() => !runner.isBusy(chat.id) && store.chats.get(chat.id)?.status === "completed");
  const after = store.chats.get(chat.id)!;
  assert.equal(provider.calls.at(-1)?.prompt, "/compact");
  assert.equal(provider.calls.at(-1)?.resumeSessionId, "s1");
  const added = store.events.list(chat.id).slice(eventsBefore);
  assert.deepEqual(
    added.map((e) => e.type),
    ["compact"],
  );
  assert.equal(after.unread, false);
  assert.equal(after.num_turns, before.num_turns);
  assert.equal(after.context_tokens, 18_000);
});

