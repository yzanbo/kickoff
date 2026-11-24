import assert from "node:assert/strict";
import { test } from "vitest";
import { autoCompactThreshold } from "./autoCompact";

test("autoCompactThreshold: 窓 × 割合。窓の終わりの余白より先には行かない。窓が分からなければ null", () => {
  assert.equal(autoCompactThreshold(200_000, 50), 100_000);
  assert.equal(autoCompactThreshold(1_000_000, 30), 300_000);
  assert.equal(autoCompactThreshold(200_000, 95), 187_000);
  assert.equal(autoCompactThreshold(null, 50), null);
  assert.equal(autoCompactThreshold(0, 50), null);
});
