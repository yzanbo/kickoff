import assert from "node:assert/strict";
import { test } from "vitest";
import type { SDKControlGetUsageResponse, SDKRateLimitInfo } from "./wire";
import { normalizeUsage } from "./usage";
import { overageInUseOf } from "./wire";

const usage = (subscription_type: string | null) =>
  ({ subscription_type, rate_limits_available: true, rate_limits: { five_hour: { utilization: 10, resets_at: null } } }) as unknown as SDKControlGetUsageResponse;

test("使用枠の変換: SDK が返したプラン種別だけを使う", () => {
  assert.equal(normalizeUsage(usage("max")).plan, "max");
  assert.equal(normalizeUsage(usage(null)).plan, null);
  assert.equal(normalizeUsage(usage("max")).windows[0].utilization, 10);
});

test("使用枠の変換: 追加の使用枠のオン・オフと、この期間の超過分の額（通貨の最小単位のまま）を写す", () => {
  const res = {
    subscription_type: "max",
    rate_limits_available: true,
    rate_limits: { extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 320, utilization: 6.4, currency: "USD" } },
  } as unknown as SDKControlGetUsageResponse;
  assert.deepEqual(normalizeUsage(res).pay_as_you_go, { enabled: true, unlimited: false, balance: null, utilization: 6.4, used: 320, limit: 5000, currency: "USD", spending: null, checked_at: null });
  // 通貨が書いていなければ null。追加の使用枠の情報がなければ null
  const noCurrency = { ...res, rate_limits: { extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null } } } as unknown as SDKControlGetUsageResponse;
  assert.equal(normalizeUsage(noCurrency).pay_as_you_go?.currency, null);
  assert.equal(normalizeUsage(usage("max")).pay_as_you_go, null);
});

test("実行中の使用枠の知らせ: いま超過分で動いているか（isUsingOverage、なければ overageInUse）。書いていなければ null", () => {
  const info = (patch: Partial<SDKRateLimitInfo>): SDKRateLimitInfo => ({ status: "allowed", ...patch });
  assert.equal(overageInUseOf(info({ isUsingOverage: true })), true);
  assert.equal(overageInUseOf(info({ isUsingOverage: false, overageInUse: true })), false);
  assert.equal(overageInUseOf(info({ overageInUse: true })), true);
  assert.equal(overageInUseOf(info({})), null);
});
