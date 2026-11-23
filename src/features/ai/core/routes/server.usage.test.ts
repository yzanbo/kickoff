// API のテスト: AI ごとの使用状況（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "vitest";
import { setup } from "@/app/core/testing/testServer";

test("使用状況: Claude と各サービスを並べ、失敗したサービスは error にしてほかは出す。取り直しは更新のときだけ", async () => {
  const { call, codexCalls } = setup({ features: ["ai"] });
  const first = await call("GET", "/api/usage");
  assert.equal(first.status, 200);
  assert.deepEqual(
    first.body.map((s: { provider: string; status: string }) => [s.provider, s.status]),
    [
      ["claude", "unavailable"],
      ["codex", "ok"],
      ["cursor", "error"],
    ],
  );
  assert.match(first.body[2].message, /つながりません/);
  // 1 分以内はとっておいた値を返す
  await call("GET", "/api/usage");
  assert.equal(codexCalls(), 1);
  const refreshed = await call("POST", "/api/usage/refresh", {});
  assert.equal(refreshed.status, 200);
  assert.equal(codexCalls(), 2);
});

test("使用状況: provider を渡せばその AI の分だけ読み・取り直す（ほかの AI は取りに行かない）", async () => {
  const { call, codexCalls } = setup({ features: ["ai"] });
  const plan = await call("GET", "/api/usage?provider=claude");
  assert.deepEqual(plan.body.map((s: { provider: string }) => s.provider), ["claude"]);
  const refreshed = await call("POST", "/api/usage/refresh", { provider: "codex", force: true });
  assert.deepEqual(refreshed.body.map((s: { provider: string }) => s.provider), ["codex"]);
  assert.equal(codexCalls(), 1);
  assert.equal((await call("POST", "/api/usage/refresh", { provider: "gpt" })).status, 400);
});
