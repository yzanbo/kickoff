import assert from "node:assert/strict";
import { test } from "vitest";
import { isUsageLimitError, resetTimeOf } from "./usageLimit";

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
