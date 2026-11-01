import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDiff, toSplitRows } from "./parseDiff";

const DIFF = [
  "diff --git a/a.txt b/a.txt",
  "index 5626abf..f00c965 100644",
  "--- a/a.txt",
  "+++ b/a.txt",
  "@@ -1,3 +1,3 @@",
  " one",
  "-two",
  "+TWO",
  "+2.5",
  " three",
  "\\ No newline at end of file",
  "",
].join("\n");

test("unified 形式の差分を、行番号つきの行に分ける（ファイルの見出しは除く）", () => {
  assert.deepEqual(parseDiff(DIFF), [
    { type: "hunk", text: "@@ -1,3 +1,3 @@" },
    { type: "context", text: "one", oldNo: 1, newNo: 1 },
    { type: "del", text: "two", oldNo: 2 },
    { type: "add", text: "TWO", newNo: 2 },
    { type: "add", text: "2.5", newNo: 3 },
    { type: "context", text: "three", oldNo: 3, newNo: 4 },
    { type: "note", text: "No newline at end of file" },
  ]);
});

test("左右に並べるときは、消した行と足した行を上から組にする", () => {
  const rows = toSplitRows(parseDiff(DIFF));
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[2], { left: { type: "del", text: "two", oldNo: 2 }, right: { type: "add", text: "TWO", newNo: 2 } });
  assert.deepEqual(rows[3], { left: undefined, right: { type: "add", text: "2.5", newNo: 3 } });
});
