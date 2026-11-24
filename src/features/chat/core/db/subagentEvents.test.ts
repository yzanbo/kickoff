// サブエージェントの数え方に要る記録だけを軽く読んでも、数え方の答え（一覧と届かなかった報告・作業の終わりに止まったもの・通信で止まったもの）が全部を読んだときと同じ
import assert from "node:assert/strict";
import { test } from "vitest";
import { collectSubagents, networkStoppedSubagents, unfinishedSubagents } from "@shared/chat/subagents";
import { scenarioChat } from "@shared/chat/testing/chatScenarios";
import { testStore } from "@/app/core/testing/testStore";

test("軽く読んだ記録でも、サブエージェントの数え方の答えは全部を読んだときと同じ", () => {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp", provider: "claude" });
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const chat = store.chats.create({ project_id: project.id, provider: "claude", title: `t${seed}`, status: "completed", model: null });
    for (const { type, data } of scenarioChat({ turns: 40, seed, chatId: chat.id })) store.events.add(chat.id, { type, ...data } as never);
    const full = store.events.list(chat.id);
    const light = store.events.forSubagents(chat.id);
    assert.ok(light.length < full.length || full.every((e) => ["user", "text", "thinking", "tool_use", "tool_result", "subagent", "result"].includes(e.type)));
    assert.deepEqual(collectSubagents(light, {}, false), collectSubagents(full, {}, false), `seed ${seed}`);
    for (const since of full.filter((e) => e.type === "result").map((e) => e.id)) {
      assert.deepEqual(unfinishedSubagents(light, since), unfinishedSubagents(full, since));
      assert.deepEqual(networkStoppedSubagents(light, since), networkStoppedSubagents(full, since));
    }
  }
});
