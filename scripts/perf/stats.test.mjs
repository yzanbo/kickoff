import assert from "node:assert/strict";
import { test } from "vitest";
import { categoryOf, percentile, summarize, summarizeProfile } from "./stats.mjs";

test("分位は最近接順位法で、空なら null", () => {
  const values = [5, 1, 4, 2, 3, 6, 7, 8, 9, 10];
  assert.equal(percentile(values, 0.5), 5);
  assert.equal(percentile(values, 0.95), 10);
  assert.equal(percentile([], 0.5), null);
  assert.deepEqual(summarize([16, 17, 33]), { n: 3, median: 17, p95: 33, max: 33 });
});

test("呼び出し場所を React・Markdown・アプリのコード・GC に分ける", () => {
  const frame = (url, functionName = "f") => ({ url, functionName, lineNumber: 0 });
  assert.equal(categoryOf(frame("http://localhost:5173/node_modules/.vite/deps/react-dom_client.js")), "react");
  assert.equal(categoryOf(frame("http://localhost:5173/node_modules/.vite/deps/react-markdown.js")), "markdown");
  assert.equal(categoryOf(frame("http://localhost:5173/src/features/chat/Timeline.tsx")), "app");
  assert.equal(categoryOf(frame("", "(garbage collector)")), "gc");
  assert.equal(categoryOf(frame("", "(program)")), "program");
});

test("プロファイルを分類ごと・関数ごとの自分の時間にまとめる", () => {
  const profile = {
    nodes: [
      { id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: 0 } },
      { id: 2, callFrame: { functionName: "render", url: "http://x/node_modules/.vite/deps/react-dom_client.js", lineNumber: 9 } },
      { id: 3, callFrame: { functionName: "groupEvents", url: "http://x/src/features/chat/timelineItems.ts", lineNumber: 99 } },
    ],
    samples: [2, 3, 3, 1],
    timeDeltas: [1000, 2000, 3000, 500],
  };
  const s = summarizeProfile(profile, 2);
  assert.equal(s.totalMs, 6.5);
  assert.deepEqual(s.categories, { app: 5, react: 1, other: 0.5 });
  assert.deepEqual(s.top, [
    { label: "groupEvents src/features/chat/timelineItems.ts:100", ms: 5 },
    { label: "render deps/react-dom_client.js:10", ms: 1 },
  ]);
});
