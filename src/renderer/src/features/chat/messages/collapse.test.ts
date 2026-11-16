import assert from "node:assert/strict";
import { test } from "vitest";
import { shouldCollapse } from "./collapse";

test("shouldCollapse: 折りたたむ高さ（240px）を 40px より多く超えたときだけ畳む", () => {
  assert.equal(shouldCollapse(0), false);
  assert.equal(shouldCollapse(240), false);
  assert.equal(shouldCollapse(280), false);
  assert.equal(shouldCollapse(280.5), true);
  assert.equal(shouldCollapse(281), true);
});
