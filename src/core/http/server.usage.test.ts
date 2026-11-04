// API のテスト: サービスごとの使用状況（共通の準備は testing/testServer.ts）
import assert from "node:assert/strict";
import { test } from "node:test";
import { setup } from "../testing/testServer.js";

test("サービスごとの使用状況: Claude と各サービスを並べ、失敗したサービスは error にしてほかは出す。取り直しは更新のときだけ", async () => {
  const { call, codexCalls } = setup();
  const first = await call("GET", "/api/usage/services");
  assert.equal(first.status, 200);
  assert.deepEqual(
    first.body.map((s: { id: string; status: string }) => [s.id, s.status]),
    [
      ["claude", "unavailable"],
      ["codex", "ok"],
      ["cursor", "error"],
    ],
  );
  assert.match(first.body[2].message, /つながりません/);
  // 5 分以内はとっておいた値を返す
  await call("GET", "/api/usage/services");
  assert.equal(codexCalls(), 1);
  const refreshed = await call("POST", "/api/usage/services/refresh");
  assert.equal(refreshed.status, 200);
  assert.equal(codexCalls(), 2);
});
