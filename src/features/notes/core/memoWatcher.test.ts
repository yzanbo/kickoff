import assert from "node:assert/strict";
import { test } from "vitest";
import { changedPath } from "./memoWatcher";

test("changedPath: 1 つのファイルだけならそのパス、いくつも・分からなければ null", () => {
  assert.equal(changedPath(["設計/DB.md"]), "設計/DB.md");
  assert.equal(changedPath(new Set(["a.md", "b.md"])), null);
  assert.equal(changedPath([null]), null);
  assert.equal(changedPath([]), null);
});
