import assert from "node:assert/strict";
import { test } from "vitest";
import { fakeClaudeSdk } from "@/foundation/core/testing/fakeClaudeSdk";
import { setup, until } from "@/app/core/testing/testServer";

test("createTestCore: 偽の Claude の SDK を渡すと、API から送ったチャットが本物の ClaudeProvider を通って終わる（ほかの AI は偽のプロバイダーのまま）", async () => {
  const sdk = fakeClaudeSdk();
  const { api, store, project, provider } = setup({ claudeSdk: sdk });
  const created = await api("POST /api/projects/:projectId/chats", { params: { projectId: project.id }, body: { text: "調べて" } });
  assert.equal(created.status, 201);
  await until(() => store.chats.get(created.body.id)?.status === "completed");
  // 実行の 1 回（ほかは名前を付けてもらう問い合わせ）
  assert.equal(sdk.queries.filter((q) => q.received.some((m) => m.message.content === "調べて")).length, 1);
  assert.equal(provider.prompts.length, 0);
});

test("createTestCore: features で絞ると、その機能と作るのに要る機能だけを組み立てる。組み立てていない機能の口は読むと足す機能を言って落ち、広げても読まない", async () => {
  const core = setup({ features: ["snippets"] });
  assert.equal((await core.api("GET /api/snippets")).status, 200);
  assert.equal((await core.call("GET", "/api/settings")).status, 404);
  assert.throws(() => core.runner, /runner は機能 chat の口（createTestCore の features に "chat" を足す）/);
  const spread = { ...core };
  assert.equal("runner" in spread, false);
  // chat を組み立てなければ、店は組み立てる前のもの（同じ DB）
  assert.equal(core.store.projects.get(core.project.id)?.name, "p");
});
