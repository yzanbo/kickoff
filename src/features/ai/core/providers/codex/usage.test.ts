import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { fakeCodexServer } from "@/features/ai/core/testing/fakeStdioServer";
import { CodexProvider } from "./provider";
import type { Account, RateLimitSnapshot } from "./protocol";
import { normalizeCodexUsage } from "./usage";

const account = { type: "chatgpt", email: "codex@example.com", planType: "pro" } as const satisfies Account;
const empty: RateLimitSnapshot = { primary: null, secondary: null, credits: null, planType: null };

test("Codex の使用枠は短い app-server に聞き、モデルへの送信やログイン操作はしない", async () => {
  const server = fakeCodexServer();
  server.handle("account/read", () => ({ account, requiresOpenaiAuth: true }));
  server.handle("account/rateLimits/read", () => ({
    rateLimits: {
      primary: { usedPercent: 15, resetsAt: 1_735_401_600, windowDurationMins: 300 },
      secondary: { usedPercent: 5, resetsAt: 1_735_920_000, windowDurationMins: 10_080 },
      credits: { hasCredits: true, unlimited: false, balance: "150.5" },
      planType: "plus",
    },
    rateLimitResetCredits: { availableCount: 8 },
  }));
  const result = await new CodexProvider({ spawn: server.spawn, env: { CODEX_HOME: "/custom", CODEX_API_KEY: "fake" } }).usage();
  assert.equal(result.status, "ok");
  assert.equal(result.plan, "plus");
  assert.equal(result.account, account.email);
  assert.deepEqual(result.windows.map((w) => [w.label, w.utilization, w.resets_at]), [
    ["5時間", 15, "2024-12-28T16:00:00.000Z"],
    ["週", 5, "2025-01-03T16:00:00.000Z"],
  ]);
  assert.equal(result.pay_as_you_go?.balance, 150.5);
  assert.deepEqual(result.notes, ["クレジット残り 150.5"]);
  assert.deepEqual(server.requests.map(({ method }) => method), ["initialize", "initialized", "account/read", "account/rateLimits/read"]);
  assert.equal(server.spawned[0].env.CODEX_HOME, "/custom");
  assert.equal(server.spawned[0].env.CODEX_API_KEY, undefined);
  assert.equal(server.killed, 1);
});

test("未ログイン・API キー・別の接続方法は、ChatGPT の使用枠を聞かない", async () => {
  for (const [auth, message] of [[null, /ログインしていません/], [{ type: "apiKey" }, /API キー/], [{ type: "gcp" }, /この接続方法/]] as const) {
    const server = fakeCodexServer();
    server.handle("account/read", () => ({ account: auth }));
    const usage = await new CodexProvider({ spawn: server.spawn }).usage();
    assert.equal(usage.status, "unavailable");
    assert.match(usage.message ?? "", message);
    assert.equal(server.requests.some(({ method }) => method === "account/rateLimits/read"), false);
    assert.equal(server.killed, 1);
  }
});

test("枠や残高が無ければ作らず、枠にプランが無ければアカウントに戻る", () => {
  const usage = normalizeCodexUsage(empty, account);
  assert.deepEqual(usage.windows, []);
  assert.equal(usage.pay_as_you_go, null);
  assert.equal(usage.plan, "pro");
  const unknown = normalizeCodexUsage({ ...empty, primary: { usedPercent: 20, windowDurationMins: null, resetsAt: null } }, account);
  assert.deepEqual(unknown.windows.map((w) => [w.label, w.resets_at]), [["主枠", null]]);
});

test("app-server から使用枠の返事がなければ待ち時間に上限を設けて閉じる", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => { vi.useRealTimers(); });
  const server = fakeCodexServer();
  server.handle("account/read", () => ({ account }));
  server.handle("account/rateLimits/read", () => new Promise(() => {}));
  const failure = assert.rejects(new CodexProvider({ spawn: server.spawn }).usage(), /時間内に応答/);
  await server.waitFor("account/rateLimits/read");
  await vi.runAllTimersAsync();
  await failure;
  assert.equal(server.killed, 1);
});
