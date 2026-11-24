import { test } from "vitest";
import assert from "node:assert/strict";
import { isAiVisible } from "./aiVisibility";

test("AI に見せるのは「見せない」以外の接続", () => {
  assert.equal(isAiVisible({ ai_access: "allow" }), true);
  assert.equal(isAiVisible({ ai_access: "ask" }), true);
  assert.equal(isAiVisible({ ai_access: "none" }), false);
});
