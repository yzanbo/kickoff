// 止まったあとの再開の殻（ChatRecovery）: つながったかは、チャットの AI ごとの先で確かめる（決まりの表は run/machine/recovery.test.ts、流れは網 S37〜S42）
import assert from "node:assert/strict";
import { onTestFinished, test } from "vitest";
import { ApprovalCenter } from "@/features/chat/core/approvals";
import { Bus } from "@/foundation/core/bus";
import { systemClock } from "@/foundation/core/clock";
import { testStore } from "@/app/core/testing/testStore";
import { until } from "@/app/core/testing/testCore";
import { ChatRuns } from "@/features/chat/core/run/chatRuns";
import type { RunEvent } from "@/features/chat/core/run/machine/types";
import type { ProviderId } from "@shared/settings/types";
import { ChatRecovery } from "./recovery";

test("通信の切断で止まったチャットのつながったかは、そのチャットの AI の先で確かめ、届いたチャットにだけ online を渡す（6 章 A4）", async () => {
  const bus = new Bus();
  const store = testStore({ onChange: (e) => bus.publish(e) });
  const project = store.projects.create({ name: "p", repo_path: "/tmp", provider: "claude" });
  const chatOf = (provider: ProviderId) => store.chats.create({ project_id: project.id, provider, title: provider, status: "failed", model: null });
  const runs = new ChatRuns({ store, bus });
  const waitOnline = (chatId: number) => {
    const runtime = runs.get(chatId);
    runtime.commit({ ...runtime.run, gates: { ...runtime.run.gates, recovery: { reason: "reconnect", holds: false, attempts: 0, agents: {}, step: { at: "wait", for: { kind: "online" }, then: "resume" } } } });
  };
  const [claude, codex] = [chatOf("claude"), chatOf("codex")];
  waitOnline(claude.id);
  waitOnline(codex.id);
  const checked = new Set<string>();
  const online: number[] = [];
  const recovery = new ChatRecovery({
    store,
    approvals: new ApprovalCenter(bus),
    runs,
    clock: systemClock,
    dispatch: (chatId: number, event: RunEvent) => void (event.type === "online" && online.push(chatId)),
    send: async () => {},
    reconnect: { check: async (url) => (checked.add(url), url === "https://api.openai.com/"), intervalMs: 5 },
  });
  onTestFinished(() => recovery.shutdown());
  recovery.run(codex.id, { do: "watch", what: "online" });
  await until(() => checked.size === 2 && online.length > 0);
  assert.deepEqual([...checked].sort(), ["https://api.anthropic.com/", "https://api.openai.com/"]);
  assert.deepEqual([...new Set(online)], [codex.id]);
});
