// 作業中でないと確かめてから用意して確定する形（idle.ts の withIdleChat）
import assert from "node:assert/strict";
import { test } from "vitest";
import { ScenarioProvider } from "./testing/scenarioProvider";
import { setupCore } from "@/app/core/testing/testCore";

function setup() {
  const core = setupCore(new ScenarioProvider());
  const chat = core.store.chats.create({ project_id: core.project.id, provider: "claude", title: "c", status: "completed" });
  return { ...core, chat };
}

test("withIdleChat: 用意している間は作業中に数え、済んだら作業していないに戻る。作業中なら 409 で断る", async () => {
  const { runner, chat } = setup();
  let busyInside = false;
  const result = await runner.withIdleChat(chat.id, "move_workplace", "作業場所の変更", async () => {
    busyInside = runner.isBusy(chat.id);
    await assert.rejects(runner.withIdleChat(chat.id, "move_workplace", "作業場所の変更", async () => 1), /作業中のチャットは作業場所の変更できません/);
    return "done";
  });
  assert.equal(result, "done");
  assert.equal(busyInside, true);
  assert.equal(runner.isBusy(chat.id), false);
});

test("withIdleChat: 失敗したら戻す手順を足した順の逆に流して投げ直す。release のあとはその場で送れる・still は断る", async () => {
  const { runner, chat } = setup();
  const undone: string[] = [];
  await assert.rejects(
    runner.withIdleChat(chat.id, "send", "巻き戻し", async ({ undo }) => {
      undo.add(() => void undone.push("a"));
      undo.add(() => void undone.push("b"));
      throw new Error("失敗");
    }),
    /失敗/,
  );
  assert.deepEqual(undone, ["b", "a"]);
  assert.equal(runner.isBusy(chat.id), false);
  await runner.withIdleChat(
    chat.id,
    "send",
    "巻き戻し",
    async ({ still, release }) => {
      still();
      release();
      assert.equal(runner.isBusy(chat.id), false);
      assert.throws(still, /変わったため/);
    },
    { conflict: "変わったため" },
  );
});

test("withIdleChat: watchQueue なら用意している間に送信待ちが変わると確定せず、失敗のあとは送信待ちを止める", async () => {
  const { runner, chat } = setup();
  await assert.rejects(
    runner.withIdleChat(
      chat.id,
      "switch_provider",
      "AI の切り替え",
      async ({ still }) => {
        await runner.queueMessage(chat.id, "準備の間に足した");
        still();
      },
      { watchQueue: true, conflict: "送信待ちが変わった" },
    ),
    /送信待ちが変わった/,
  );
  assert.equal(runner.queueState(chat.id).paused, true);
  assert.equal(runner.isBusy(chat.id), false);
});
