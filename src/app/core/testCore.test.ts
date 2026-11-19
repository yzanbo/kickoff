import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeClaudeSdk } from "@/foundation/core/testing/fakeClaudeSdk";
import { setup, until } from "@/app/core/testing/testServer";

test("createTestCore: 偽の Claude の SDK を渡すと、API から送ったチャットが本物の ClaudeProvider を通って終わる（ほかの AI は偽のプロバイダーのまま）", async () => {
  const sdk = fakeClaudeSdk();
  const { call, store, project, provider } = setup({ claudeSdk: sdk });
  const created = await call("POST", `/api/projects/${project.id}/chats`, { text: "調べて" });
  assert.equal(created.status, 201);
  await until(() => store.chats.get(created.body.id)?.status === "completed");
  // 実行の 1 回（ほかは名前を付けてもらう問い合わせ）
  assert.equal(sdk.queries.filter((q) => q.received.some((m) => m.message.content === "調べて")).length, 1);
  assert.equal(provider.prompts.length, 0);
});
