import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitStatus } from "@shared/types";
import { changedFiles, changeOf } from "./sideFile";

const status = (parts: Partial<Extract<GitStatus, { repo: true }>>): GitStatus => ({
  repo: true,
  branch: "main",
  upstream: null,
  has_origin: false,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  conflicts: [],
  ...parts,
});

test("changeOf: ステージされていない変更を先に、なければステージされている変更", () => {
  const s = status({ staged: [{ path: "a.ts", kind: "M" }, { path: "b.ts", kind: "A" }], unstaged: [{ path: "a.ts", kind: "M" }] });
  assert.deepEqual(changeOf(s, "a.ts"), { file: { path: "a.ts", kind: "M" }, staged: false });
  assert.deepEqual(changeOf(s, "b.ts"), { file: { path: "b.ts", kind: "A" }, staged: true });
});

test("changeOf: 競合しているファイルはステージされていない差分として出す", () => {
  assert.deepEqual(changeOf(status({ conflicts: [{ path: "c.ts", kind: "U" }] }), "c.ts"), { file: { path: "c.ts", kind: "U" }, staged: false });
});

test("changeOf: 変更がない・Git でない・まだ読んでいないときは undefined", () => {
  assert.equal(changeOf(status({}), "a.ts"), undefined);
  assert.equal(changeOf({ repo: false }, "a.ts"), undefined);
  assert.equal(changeOf(undefined, "a.ts"), undefined);
});

test("changedFiles: 同じファイルは 1 つにまとめ、パスの順に並べる", () => {
  const s = status({ staged: [{ path: "b.ts", kind: "A" }, { path: "a.ts", kind: "M" }], unstaged: [{ path: "a.ts", kind: "M" }, { path: "c.ts", kind: "U" }] });
  assert.deepEqual(
    changedFiles(s).map((c) => [c.file.path, c.staged]),
    [
      ["a.ts", false],
      ["b.ts", true],
      ["c.ts", false],
    ],
  );
  assert.deepEqual(changedFiles({ repo: false }), []);
});
