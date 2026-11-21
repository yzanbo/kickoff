import assert from "node:assert/strict";
import { test } from "vitest";
import type { UsageWindow } from "./types";
import { exhaustedResetOf, limitReachedOf, type ProviderUsage } from "./usage";

test("使用枠の上限: 時刻が知らされなければ、使い切った枠のうちいちばん遅く戻る時刻を使う", () => {
  const w = (key: string, utilization: number | null, resets_at: string | null): UsageWindow => ({ key, label: key, utilization, resets_at });
  const usage = (...windows: UsageWindow[]): ProviderUsage => ({ provider: "claude", status: "ok", plan: "max", account: null, windows, notes: [], pay_as_you_go: null, fetched_at: "2026-11-04T00:00:00Z" });
  // 5 時間の枠だけ使い切った
  assert.equal(exhaustedResetOf(usage(w("five_hour", 100, "2026-11-04T05:00:00Z"), w("seven_day", 40, "2026-11-08T00:00:00Z"))), "2026-11-04T05:00:00Z");
  // 週の枠も使い切っていれば、遅い方
  assert.equal(exhaustedResetOf(usage(w("five_hour", 100, "2026-11-04T05:00:00Z"), w("seven_day", 70, null), w("model:fable", 100, "2026-11-06T00:00:00Z"))), "2026-11-06T00:00:00Z");
  // 使い切った枠がない・使用枠が分からない
  assert.equal(exhaustedResetOf(usage(w("five_hour", 90, "2026-11-04T05:00:00Z"), w("seven_day", 40, null))), null);
  assert.equal(exhaustedResetOf({ ...usage(w("five_hour", 100, "x"), w("seven_day", 0, null)), status: "unavailable" }), null);
});

test("上限に達した枠があるか: 分かる枠のどれかが 100% 以上。枠が分からなければ null", () => {
  assert.equal(limitReachedOf([20, 100]), true);
  assert.equal(limitReachedOf([20, null]), false);
  assert.equal(limitReachedOf([null, null]), null);
  assert.equal(limitReachedOf([]), null);
});
