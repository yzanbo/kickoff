import assert from "node:assert/strict";
import { test } from "node:test";
import { autoCompactEnv, autoCompactThreshold } from "./autoCompact";

test("autoCompactThreshold: 窓 × 割合。窓の終わりの余白より先には行かない。窓が分からなければ null", () => {
  assert.equal(autoCompactThreshold(200_000, 50), 100_000);
  assert.equal(autoCompactThreshold(1_000_000, 30), 300_000);
  assert.equal(autoCompactThreshold(200_000, 95), 187_000);
  assert.equal(autoCompactThreshold(null, 50), null);
  assert.equal(autoCompactThreshold(0, 50), null);
});

test("autoCompactEnv: 決めたときだけ CLAUDE_AUTOCOMPACT_PCT_OVERRIDE を渡す", () => {
  assert.deepEqual(autoCompactEnv(50), { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50" });
  assert.deepEqual(autoCompactEnv(null), {});
});
