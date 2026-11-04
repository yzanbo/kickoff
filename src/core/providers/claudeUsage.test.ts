import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { SDKControlGetUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import { normalizeUsage, readPlanDisplayName } from "./claudeUsage.js";

const usage = (subscription_type: string | null) =>
  ({ subscription_type, rate_limits_available: true, rate_limits: { five_hour: { utilization: 10, resets_at: null } } }) as unknown as SDKControlGetUsageResponse;

test("プランの表示名: Claude Code の設定ファイルの oauthAccount.planDisplayName を読む（Max の段階を見分ける）", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kickoff-plan-"));
  try {
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("使用枠の変換: プランは表示名があればそれ、なければ種類。API キー（種類なし）なら表示名があってもプランなし", () => {
  assert.equal(normalizeUsage(usage("max"), "Ultra").plan, "Ultra");
  assert.equal(normalizeUsage(usage("max")).plan, "max");
  assert.equal(normalizeUsage(usage(null), "Ultra").plan, null);
  assert.equal(normalizeUsage(usage("max"), "Ultra").five_hour.utilization, 10);
});
