// 作業の終わりに行う予約の入れ物（turnEnd.ts）: 順番・行う時・待つ予約のやり直し
import assert from "node:assert/strict";
import { test } from "vitest";
import { ScenarioProvider } from "@/features/chat/core/run/testing/scenarioProvider";
import { setupCore, until } from "@/app/core/testing/testCore";

const at = (ms: number) => new Date(ms).toISOString();

test("作業の終わりの予約: 送信待ちを先に止め、order の順に行う（最後まで終わった作業の移動は、先に済んだ片付けを知って行う）", async () => {
  const { runner, provider, project } = setupCore(new ScenarioProvider());
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => provider.runs.length === 1);
  const ran: string[] = [];
  runner.reserveAtTurnEnd(chat.id, { kind: "archive_chat", order: 30, label: "a", when: "any", pauseQueue: true, run: async () => (ran.push("archive"), "done") });
  runner.reserveAtTurnEnd(chat.id, { kind: "move_workplace", order: 20, label: "m", when: "completed", pauseQueue: false, run: async ({ done }) => (ran.push(`move:${done.join()}`), "done") });
  runner.reserveAtTurnEnd(chat.id, { kind: "finish_worktree", order: 10, label: "f", when: "any", pauseQueue: true, folder: "/w", run: async () => (ran.push("finish"), "done") });
  assert.deepEqual([...runner.reservedFolders()], ["/w"]);
  await runner.queueMessage(chat.id, "次");
  provider.end(provider.runs[0], "completed", { session: "s1", at });
  await until(() => ran.length === 3 && !runner.isBusy(chat.id));
  assert.deepEqual(ran, ["finish", "move:finish_worktree", "archive"]);
  // 送信待ちは止めたまま（予約したチャットで次の指示が勝手に動かない）
  assert.equal(runner.queueState(chat.id).paused, true);
  assert.equal(provider.runs.length, 1);
  assert.equal(runner.hasTurnEnd(chat.id), false);
});

test("作業の終わりの予約: 止めた作業では最後まで終わった作業の予約を行わずにお知らせし、ほかは行う。待つ予約は、ほかのチャットが作業していないに戻ったらもう一度", async () => {
  const { store, runner, provider, project } = setupCore(new ScenarioProvider());
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => provider.runs.length === 1);
  let tries = 0;
  runner.reserveAtTurnEnd(chat.id, { kind: "move_workplace", order: 20, label: "m", when: "completed", pauseQueue: false, run: async () => "done", skipped: () => "移しませんでした" });
  runner.reserveAtTurnEnd(chat.id, { kind: "delete_chat", order: 30, label: "d", when: "any", pauseQueue: false, run: async () => (++tries === 1 ? "wait" : "done") });
  provider.end(provider.runs[0], "cancelled", { session: "s1", at });
  await until(() => tries === 1 && !runner.isBusy(chat.id));
  assert.ok(store.events.list(chat.id).some((e) => e.type === "notice" && e.data.message === "移しませんでした"));
  assert.equal(runner.hasTurnEnd(chat.id, "delete_chat"), true);
  // ほかのチャットの作業が終わったら、待っていた予約をもう一度試す
  const other = await runner.start({ projectId: project.id, prompt: "2" });
  await until(() => provider.runs.length === 2);
  provider.end(provider.runs[1], "completed", { session: "s2", at });
  await until(() => tries === 2 && !runner.isBusy(other.id));
  assert.equal(runner.hasTurnEnd(chat.id), false);
});
