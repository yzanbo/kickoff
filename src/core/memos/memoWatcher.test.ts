import assert from "node:assert/strict";
import { test } from "node:test";
import { changedPath } from "./memoWatcher.js";

test("changedPath: 1 つのファイルだけならそのパス、いくつも・分からなければ null", () => {
  assert.equal(changedPath(["設計/DB.md"]), "設計/DB.md");
  assert.equal(changedPath(new Set(["a.md", "b.md"])), null);
  assert.equal(changedPath([null]), null);
  assert.equal(changedPath([]), null);
});
