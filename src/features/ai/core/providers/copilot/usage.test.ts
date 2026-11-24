import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { fakeCopilotClient } from "@/features/ai/core/testing/fakeCopilotClient";
import { CopilotProvider } from "./provider";
import type { CopilotQuota } from "./sdk";
import { normalizeCopilotUsage } from "./usage";

const limited = {
  isUnlimitedEntitlement: false,
  entitlementRequests: 300,
  usedRequests: 120,
  remainingPercentage: 60,
  resetDate: "2026-12-01",
  usageAllowedWithExhaustedQuota: true,
  overage: 0,
  overageAllowedWithExhaustedQuota: false,
};
const quota = { quotaSnapshots: {
  premium_interactions: limited,
  chat: { ...limited, entitlementRequests: -1 },
} } satisfies CopilotQuota;

test("Copilot の SDK に枠とログイン名を聞き、会話を作らずにクライアントを終了する", async () => {
  const fake = fakeCopilotClient();
  fake.quota = quota;
  const usage = await new CopilotProvider({ clientFactory: fake.factory, env: { GH_TOKEN: "fake" } }).usage();
  assert.equal(usage.status, "ok");
  assert.equal(usage.account, "octo");
  assert.equal(usage.plan, null);
  assert.deepEqual(usage.windows, [{
    key: "premium_interactions", label: "プレミアムリクエスト（月）",
    utilization: 40, detail: "120 / 300 回", resets_at: "2026-12-01T00:00:00.000Z",
  }]);
  assert.deepEqual(usage.notes, ["チャット: 無制限"]);
  assert.equal(fake.quotaRequests, 1);
  assert.deepEqual(fake.clients.map(({ started, stopped, env }) => [started, stopped, env.GH_TOKEN]), [[true, true, undefined]]);
  assert.deepEqual(fake.sessions, []);
});

test("Copilot にログインしていなければ、使用枠は聞かない", async () => {
  const fake = fakeCopilotClient();
  fake.auth = { isAuthenticated: false };
  const usage = await new CopilotProvider({ clientFactory: fake.factory }).usage();
  assert.equal(usage.status, "unavailable");
  assert.match(usage.message ?? "", /ログインしていません/);
  assert.equal(fake.quotaRequests, 0);
  assert.equal(fake.clients[0].stopped, true);
});

test("空や未知の枠は数や単位を推測せず取得不可にする", () => {
  for (const quotaSnapshots of [{}, { future_credits: limited }]) {
    const usage = normalizeCopilotUsage({ quotaSnapshots }, "octo");
    assert.equal(usage.status, "unavailable");
    assert.deepEqual(usage.windows, []);
    assert.equal(usage.account, "octo");
  }
  const unlimited = normalizeCopilotUsage({ quotaSnapshots: { chat: { ...limited, isUnlimitedEntitlement: true } } }, null);
  assert.deepEqual(unlimited.windows, []);
  assert.deepEqual(unlimited.notes, ["チャット: 無制限"]);
});

test("使用枠が無応答で、通常の終了も詰まれば専用ランタイムを強制終了する", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  onTestFinished(() => { vi.useRealTimers(); });
  const fake = fakeCopilotClient();
  const provider = new CopilotProvider({
    clientFactory: (opts) => ({
      ...fake.factory(opts),
      getQuota: () => new Promise(() => {}),
      stop: () => new Promise(() => {}),
    }),
  });
  const failure = assert.rejects(provider.usage(), /時間内に使用枠/);
  await vi.runAllTimersAsync();
  await failure;
  assert.equal(fake.clients[0].stopped, true);
});
