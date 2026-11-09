import assert from "node:assert/strict";
import { test } from "node:test";
import { lineKey, pushHistory, replaceTargets, resultCounts, visibleResults, type SearchFileResult } from "./searchHits";

const m = (line: number, text = `t${line}`) => ({ line, column: 1, text });
const files: SearchFileResult[] = [
  { path: "a.ts", matches: [m(1), m(2)] },
  { path: "b.ts", matches: [m(3)] },
];

test("visibleResults: 外したファイル・行を除き、行がなくなったファイルも除く", () => {
  assert.equal(visibleResults(files, new Set()), files);
  assert.deepEqual(visibleResults(files, new Set(["a.ts"])).map((f) => f.path), ["b.ts"]);
  assert.deepEqual(visibleResults(files, new Set([lineKey("a.ts", 1)]))[0].matches, [m(2)]);
  assert.deepEqual(visibleResults(files, new Set([lineKey("b.ts", 3)])).map((f) => f.path), ["a.ts"]);
});

test("replaceTargets・resultCounts: 置換する行の形と、結果の数", () => {
  assert.deepEqual(replaceTargets([files[1]]), [{ path: "b.ts", lines: [{ line: 3, text: "t3" }] }]);
  assert.deepEqual(resultCounts(files), { files: 2, lines: 3 });
});

test("pushHistory: 新しいものを先頭に、重ねず、上限まで", () => {
  assert.deepEqual(pushHistory(["b", "a"], " a "), ["a", "b"]);
  assert.deepEqual(pushHistory(["a"], "  "), ["a"]);
  assert.deepEqual(pushHistory(["c", "b", "a"], "d", 3), ["d", "c", "b"]);
});
