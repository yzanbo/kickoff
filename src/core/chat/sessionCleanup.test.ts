import assert from "node:assert/strict";
import { test } from "node:test";
import { Store } from "../db/store.js";
import type { AgentProvider } from "../providers/types.js";
import type { ProviderId } from "@shared/types";
import { discardUnusedSessions } from "./sessionCleanup.js";

test("使っていない会話記録を消す: ほかの Kickoff（製品版と開発版）のチャットが使っているものは残す", async () => {
  const store = new Store(":memory:", () => {});
  const asked: string[][] = [];
  const provider = { discardSessions: async (ids: string[]) => (asked.push(ids), ids.length) } as unknown as AgentProvider;
  const providers = { claude: provider } as Record<ProviderId, AgentProvider>;
  const sessions = { byProvider: new Map<ProviderId, Set<string>>([["claude", new Set(["mine", "shared"])]]), cwds: ["/work/p"] };
  const moved = await discardUnusedSessions(store, providers, sessions, async () => {}, (ids) => new Set(ids.filter((id) => id === "shared")));
  assert.equal(moved, 1);
  assert.deepEqual(asked, [["mine"]]);
});
