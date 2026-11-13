import assert from "node:assert/strict";
import { test } from "node:test";
import { pullFileChanges, pullFileKind } from "./pullFiles";

test("pullFileKind: GitHub の変わり方を変更タブの記号に", () => {
  assert.deepEqual(["added", "removed", "renamed", "copied", "modified", "changed", "unchanged"].map(pullFileKind), ["A", "D", "R", "C", "M", "M", "M"]);
});

test("pullFileChanges: 元のパスは名前を変えたものだけ", () => {
  assert.deepEqual(
    pullFileChanges([
      { path: "a/b.ts", previous_path: "a/old.ts", status: "renamed", additions: 0, deletions: 0, patch: null },
      { path: "c.ts", previous_path: null, status: "added", additions: 1, deletions: 0, patch: "" },
    ]),
    [
      { path: "a/b.ts", old_path: "a/old.ts", kind: "R" },
      { path: "c.ts", kind: "A" },
    ],
  );
});
