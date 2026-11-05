import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitStatus } from "@shared/types";
import { changedFiles, changeOf, diffFingerprint, pruneViewed, viewedStateOf } from "./sideFile";

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

test("diffFingerprint: 同じ差分は同じ指紋、中身・バイナリかが違えば違う指紋", () => {
  const diff = { diff: "@@ -1 +1 @@\n-a\n+b", binary: false, truncated: false };
  assert.equal(diffFingerprint(diff), diffFingerprint({ ...diff }));
  assert.notEqual(diffFingerprint(diff), diffFingerprint({ ...diff, diff: "@@ -1 +1 @@\n-a\n+c" }));
  assert.notEqual(diffFingerprint({ ...diff, diff: "" }), diffFingerprint({ diff: "", binary: true, truncated: false }));
});

test("viewedStateOf: 確認したときの指紋と比べる（読み込む前は確認済みのまま）", () => {
  const viewed = { "a.ts": "f1" };
  assert.equal(viewedStateOf(viewed, "a.ts", "f1"), "viewed");
  assert.equal(viewedStateOf(viewed, "a.ts", undefined), "viewed");
  assert.equal(viewedStateOf(viewed, "a.ts", "f2"), "changed");
  assert.equal(viewedStateOf(viewed, "b.ts", "f1"), "none");
});

test("pruneViewed: 変更のなくなったファイルの印を外し、外すものがなければ同じものを返す", () => {
  const viewed = { "a.ts": "f1", "b.ts": "f2" };
  assert.deepEqual(pruneViewed(viewed, ["a.ts", "c.ts"]), { "a.ts": "f1" });
  assert.equal(pruneViewed(viewed, ["a.ts", "b.ts"]), viewed);
});
