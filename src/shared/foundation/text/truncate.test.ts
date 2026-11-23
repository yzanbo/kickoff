import assert from "node:assert/strict";
import { test } from "vitest";
import { truncate } from "./truncate";

test("truncate: 上限より長ければ上限で切って「…」を付け、上限までならそのまま", () => {
  assert.equal(truncate("あいうえお", 3), "あいう…");
  assert.equal(truncate("あいう", 3), "あいう");
  assert.equal(truncate("", 3), "");
});
