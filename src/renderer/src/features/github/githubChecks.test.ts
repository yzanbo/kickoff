import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDuration } from "./githubChecks";

test("checkDuration: 終わったものは所要時間・動いているものは今まで・時刻がなければ null", () => {
  assert.equal(checkDuration({ started_at: "2026-11-13T00:00:00Z", completed_at: "2026-11-13T00:03:20Z" }), "3分20秒");
  assert.equal(checkDuration({ started_at: "2026-11-13T00:00:00Z", completed_at: null }, Date.parse("2026-11-13T00:00:45Z")), "45秒〜");
  assert.equal(checkDuration({ started_at: null, completed_at: null }), null);
  assert.equal(checkDuration({ started_at: "2026-11-13T00:01:00Z", completed_at: "2026-11-13T00:00:00Z" }), null);
  assert.equal(checkDuration({ started_at: "壊れた", completed_at: "2026-11-13T00:00:00Z" }), null);
});
