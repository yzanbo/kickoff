import assert from "node:assert/strict";
import { test } from "node:test";
import { makeReviewThread } from "@shared/testing/factories";
import { parseDiff } from "@/features/editor/parseDiff";
import { placeThreads, threadsAt } from "./pullThreads";

// 古い側の 10〜12 行目 → 新しい側の 10〜12 行目（11 行目を書き換え）
const lines = parseDiff(["@@ -10,3 +10,3 @@", " a", "-b", "+B", " c"].join("\n"));
const at = (no: number, type: string) => lines.find((l) => l.type === type && (l.newNo ?? l.oldNo) === no)!;

test("placeThreads: RIGHT は新しい側の行、LEFT は古い側の行の下に付ける", () => {
  const right = makeReviewThread(1, { line: 11, side: "RIGHT" });
  const left = makeReviewThread(2, { line: 11, side: "LEFT" });
  const placed = placeThreads([right, left], "src/a.ts", lines);
  assert.deepEqual(threadsAt(placed, at(11, "add")), [right]);
  assert.deepEqual(threadsAt(placed, at(11, "del")), [left]);
  assert.deepEqual(placed.rest, []);
});

test("placeThreads: 残した行には、古い側・新しい側のどちらの番号で付いたスレッドも出す", () => {
  const right = makeReviewThread(1, { line: 12, side: "RIGHT" });
  const left = makeReviewThread(2, { line: 12, side: "LEFT" });
  const placed = placeThreads([right, left], "src/a.ts", lines);
  assert.deepEqual(threadsAt(placed, at(12, "context")), [right, left]);
});

test("placeThreads: ほかのファイルは外し、差分にない行・行のない古い差分のスレッドは rest に回す", () => {
  const other = makeReviewThread(1, { path: "src/b.ts", line: 11 });
  const outside = makeReviewThread(2, { line: 99 });
  const outdated = makeReviewThread(3, { line: null, outdated: true });
  const placed = placeThreads([other, outside, outdated], "src/a.ts", lines);
  assert.equal(placed.byLine.size, 0);
  assert.deepEqual(placed.rest, [outside, outdated]);
});
