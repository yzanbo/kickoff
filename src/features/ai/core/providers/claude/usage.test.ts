import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import type { SDKControlGetUsageResponse, SDKRateLimitInfo } from "@anthropic-ai/claude-agent-sdk";
import { normalizeUsage, overageInUseOf, readPlanDisplayName } from "./usage";
import { tempDir } from "@/foundation/core/testing/tempDir";

const usage = (subscription_type: string | null) =>
  ({ subscription_type, rate_limits_available: true, rate_limits: { five_hour: { utilization: 10, resets_at: null } } }) as unknown as SDKControlGetUsageResponse;

test("プランの表示名: Claude Code の設定ファイルの oauthAccount.planDisplayName を読む（Max の段階を見分ける）", async () => {
  const dir = tempDir();
  const path = join(dir, ".claude.json");
  writeFileSync(path, JSON.stringify({ oauthAccount: { planDisplayName: "Ultra", organizationType: "claude_max" } }));
  assert.equal(await readPlanDisplayName(path), "Ultra");
  writeFileSync(path, JSON.stringify({ oauthAccount: { planDisplayName: "Max 20x" } }));
  assert.equal(await readPlanDisplayName(path), "Max 20x");
  // 形のおかしい値・ないとき・ファイルがないときは null
  writeFileSync(path, JSON.stringify({ oauthAccount: { planDisplayName: "<script>" } }));
  assert.equal(await readPlanDisplayName(path), null);
  writeFileSync(path, JSON.stringify({ oauthAccount: {} }));
  assert.equal(await readPlanDisplayName(path), null);
  writeFileSync(path, "{壊れた");
  assert.equal(await readPlanDisplayName(path), null);
  assert.equal(await readPlanDisplayName(join(dir, "nai.json")), null);
});

test("使用枠の変換: プランは表示名があればそれ、なければ種類。API キー（種類なし）なら表示名があってもプランなし", () => {
  assert.equal(normalizeUsage(usage("max"), "Ultra").plan, "Ultra");
  assert.equal(normalizeUsage(usage("max")).plan, "max");
  assert.equal(normalizeUsage(usage(null), "Ultra").plan, null);
  assert.equal(normalizeUsage(usage("max"), "Ultra").five_hour.utilization, 10);
});

test("使用枠の変換: 追加の使用枠のオン・オフと、この期間の超過分の額（通貨の最小単位のまま）を写す", () => {
  const res = {
    subscription_type: "max",
    rate_limits_available: true,
    rate_limits: { extra_usage: { is_enabled: true, monthly_limit: 5000, used_credits: 320, utilization: 6.4, currency: "USD" } },
  } as unknown as SDKControlGetUsageResponse;
  assert.deepEqual(normalizeUsage(res).extra_usage, { enabled: true, utilization: 6.4, used_credits: 320, monthly_limit: 5000, currency: "USD" });
  // 通貨が書いていなければ null。追加の使用枠の情報がなければ null
  const noCurrency = { ...res, rate_limits: { extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null } } } as unknown as SDKControlGetUsageResponse;
  assert.equal(normalizeUsage(noCurrency).extra_usage?.currency, null);
  assert.equal(normalizeUsage(usage("max")).extra_usage, null);
});

test("実行中の使用枠の知らせ: いま超過分で動いているか（isUsingOverage、なければ overageInUse）。書いていなければ null", () => {
  const info = (patch: Partial<SDKRateLimitInfo>): SDKRateLimitInfo => ({ status: "allowed", ...patch });
  assert.equal(overageInUseOf(info({ isUsingOverage: true })), true);
  assert.equal(overageInUseOf(info({ isUsingOverage: false, overageInUse: true })), false);
  assert.equal(overageInUseOf(info({ overageInUse: true })), true);
  assert.equal(overageInUseOf(info({})), null);
});
