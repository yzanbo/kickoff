import assert from "node:assert/strict";
import { test } from "vitest";
import { fenceFor } from "./fence";

test("fenceFor: 中身のいちばん長い ` の並びより 1 つ長く、少なくとも 3 つ", () => {
  assert.equal(fenceFor("ログ"), "```");
  assert.equal(fenceFor("a `b` ``c``"), "```");
  assert.equal(fenceFor("```js\nx\n```"), "````");
  assert.equal(fenceFor("`````"), "``````");
});
