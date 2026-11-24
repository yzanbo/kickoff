import { test } from "vitest";
import assert from "node:assert/strict";
import { changedNoteDirs } from "./noteDirChanges";

test("場所が変わったプロジェクトだけを返す（新しく知ったプロジェクト・消えたプロジェクトは数えない）", () => {
  const previous = new Map([
    [1, "/notes/a"],
    [2, "/notes/b"],
    [3, "/notes/c"],
  ]);
  const next = new Map([
    [1, "/notes/a"],
    [2, "/elsewhere/b"],
    [4, "/notes/d"],
  ]);
  assert.deepEqual(changedNoteDirs(previous, next), [2]);
});
