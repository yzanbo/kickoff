import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrashId, restoreName } from "./names.js";

test("restoreName: 拡張子の前に番号を付け、重ならない名前にする", () => {
  assert.equal(restoreName("a.txt", () => false), "a 2.txt");
  const taken = new Set(["a 2.txt", "a 3.txt"]);
  assert.equal(restoreName("a.txt", (n) => taken.has(n)), "a 4.txt");
  assert.equal(restoreName("dir", () => false), "dir 2");
  assert.equal(restoreName(".env", () => false), ".env 2");
  assert.equal(restoreName("a.tar.gz", () => false), "a.tar 2.gz");
});

test("isTrashId: uuid の小文字だけ", () => {
  assert.ok(isTrashId("0b7f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b"));
  assert.ok(!isTrashId("0B7F6A2E-1C3D-4E5F-8A9B-0C1D2E3F4A5B"));
  assert.ok(!isTrashId("../etc"));
});
