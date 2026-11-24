// 殻の長い準備（preparations.ts）: 新しいチャットを作る・準備中に止める
import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { ScenarioProvider } from "./testing/scenarioProvider";
import { setupCore, until } from "@/app/core/testing/testCore";

test("新しいチャットを作っている間（最初の発言の下ごしらえ）も作業中に数え、同じチャットに送ると 409（実行を 2 つ並べない。6 章 A7・S51）", async () => {
  const { store, runner, provider, project } = setupCore(new ScenarioProvider());
  const create = store.chats.create.bind(store.chats);
  let busy = false;
  let during: Promise<unknown> | null = null;
  // チャットを作った直後（下ごしらえを待っている間）に、同じチャットへ送る
  vi.spyOn(store.chats, "create").mockImplementation((input) => {
    const made = create(input);
    queueMicrotask(() => {
      busy = runner.isBusy(made.id);
      during = runner.message(made.id, { text: "2" });
    });
    return made;
  });
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  assert.equal(busy, true);
  await assert.rejects(during!, /作業中のチャットは送信できません/);
  await until(() => provider.runs.length === 1);
  provider.end(provider.runs[0], "completed", { session: "s1", at: (ms) => new Date(ms).toISOString() });
  await until(() => !runner.isBusy(chat.id));
  assert.deepEqual(provider.runs.map((r) => r.params.prompt), ["1"]);
});

test("新しいチャットを作っている間に止めると、動かし始めたらすぐ中断で終え、AI を動かさない（6 章 A8・S52）", async () => {
  const { store, runner, provider, project } = setupCore(new ScenarioProvider());
  const create = store.chats.create.bind(store.chats);
  vi.spyOn(store.chats, "create").mockImplementation((input) => {
    const made = create(input);
    queueMicrotask(() => runner.cancel(made.id));
    return made;
  });
  const chat = await runner.start({ projectId: project.id, prompt: "1" });
  await until(() => !runner.isBusy(chat.id));
  assert.equal(provider.runs.length, 0);
  assert.equal(store.chats.get(chat.id)?.status, "cancelled");
});
