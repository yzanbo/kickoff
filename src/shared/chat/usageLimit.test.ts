import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanUsage, UsageWindow } from "@shared/types";
import { exhaustedResetOf, isUsageLimitError, resetTimeOf } from "@shared/chat/usageLimit";

test("使用枠の上限: 失敗の文の見分けと、枠が戻る時刻（秒・ミリ秒）", () => {
  assert.equal(isUsageLimitError("Claude AI usage limit reached|1762240800"), true);
  assert.equal(isUsageLimitError("You've hit your limit · resets 3pm"), true);
  assert.equal(isUsageLimitError("API Error: Connection error."), false);
  assert.equal(isUsageLimitError(undefined), false);
  assert.equal(resetTimeOf(1762240800), "2025-11-04T07:20:00.000Z");
  assert.equal(resetTimeOf(1762240800000), "2025-11-04T07:20:00.000Z");
  assert.equal(resetTimeOf(undefined), null);
  assert.equal(resetTimeOf(0), null);
});

test("使用枠の上限: 時刻が知らされなければ、使い切った枠のうちいちばん遅く戻る時刻を使う", () => {
  const w = (key: string, utilization: number | null, resets_at: string | null): UsageWindow => ({ key, label: key, utilization, resets_at });
  const usage = (five: UsageWindow, week: UsageWindow, models: UsageWindow[] = []): PlanUsage => ({
    provider: "claude",
    provider_label: "Claude",
    available: true,
    plan: "max",
    five_hour: five,
    seven_day: week,
    model_weekly: models,
    fetched_at: "2026-11-04T00:00:00Z",
  });
  // 5 時間の枠だけ使い切った
  assert.equal(exhaustedResetOf(usage(w("five_hour", 100, "2026-11-04T05:00:00Z"), w("seven_day", 40, "2026-11-08T00:00:00Z"))), "2026-11-04T05:00:00Z");
  // 週の枠も使い切っていれば、遅い方
  assert.equal(
    exhaustedResetOf(usage(w("five_hour", 100, "2026-11-04T05:00:00Z"), w("seven_day", 70, null), [w("fable", 100, "2026-11-06T00:00:00Z")])),
    "2026-11-06T00:00:00Z",
  );
  // 使い切った枠がない・使用枠が分からない
  assert.equal(exhaustedResetOf(usage(w("five_hour", 90, "2026-11-04T05:00:00Z"), w("seven_day", 40, null))), null);
  assert.equal(exhaustedResetOf({ ...usage(w("five_hour", 100, "x"), w("seven_day", 0, null)), available: false }), null);
});
