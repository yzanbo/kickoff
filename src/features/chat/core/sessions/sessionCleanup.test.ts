import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";
import type { ProviderId } from "@shared/settings/types";
import { collectChatSessions, discardUnusedSessions } from "./sessionCleanup";
import { ScriptedProvider } from "@/features/ai/core/testing";
import { setupCore, until } from "@/app/core/testing/testCore";
import type { AgentProvider } from "@/features/ai/core";

test("AI を替えたチャットのセッションは、その時点の AI ごとに集める", () => {
  const store = testStore();
  const project = store.projects.create({ name: "p", repo_path: "/tmp/p", provider: "claude" });
  const chat = store.chats.create({ project_id: project.id, provider: "codex", title: "切り替え", status: "completed" });
  store.events.add(chat.id, { type: "init", session_id: "claude-1" });
  store.events.add(chat.id, { type: "provider_switched", from: "claude", to: "codex" });
  store.events.add(chat.id, { type: "result", status: "completed", session_id: "codex-1" });
  store.chatProviderSessions.save(chat.id, "claude", "claude-2", null);
  const collected = collectChatSessions(store, [chat], (id) => store.chatProviderSessions.list(id));
  assert.deepEqual([...collected.byProvider.get("claude")!].sort(), ["claude-1", "claude-2"]);
  assert.deepEqual([...collected.byProvider.get("codex")!], ["codex-1"]);
  store.close();
});

test("コンテキスト消去時は、別の AI に戻しても古いセッションを再開しない", async () => {
  const { store, runner, project } = setupCore(new ScriptedProvider(async () => ({ status: "completed", sessionId: "claude-1" })));
  const chat = await runner.start({ projectId: project.id, prompt: "質問" });
  await until(() => !runner.isBusy(chat.id));
  store.chatProviderSessions.save(chat.id, "codex", "codex-1", null);
  assert.equal(store.chatProviderSessions.list(chat.id).length, 1);
  runner.clear(chat.id);
  assert.deepEqual(store.chatProviderSessions.list(chat.id), []);
  assert.equal(store.chats.get(chat.id)?.session_id, null);
});

test("使っていない会話記録を消す: ほかの Kickoff（製品版と開発版）のチャットが使っているものは残す", async () => {
  const store = testStore();
  const asked: string[][] = [];
  const provider = { sessions: { discard: async (ids: string[]) => (asked.push(ids), ids.length) } } as unknown as AgentProvider;
  const providers = { claude: provider } as Record<ProviderId, AgentProvider>;
  const sessions = { byProvider: new Map<ProviderId, Set<string>>([["claude", new Set(["mine", "shared"])]]), cwds: ["/work/p"] };
  const moved = await discardUnusedSessions(store, providers, sessions, async () => {}, (ids) => new Set(ids.filter((id) => id === "shared")));
  assert.equal(moved, 1);
  assert.deepEqual(asked, [["mine"]]);
});
