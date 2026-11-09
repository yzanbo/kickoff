import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { tempDir } from "../testing/tempDir.js";
import { findMemoLines, searchMemoTexts } from "./memoSearch.js";

test("findMemoLines: 大文字・小文字を区別せずに行を探し、頭の空白を省いて見つかった位置を返す", () => {
  assert.deepEqual(findMemoLines("# Title\n  hello World\r\nno", "world"), [{ line: 2, text: "hello World", match_start: 6, match_end: 11 }]);
  assert.deepEqual(findMemoLines("a\na\na", "a", 2).map((h) => h.line), [1, 2]);
  assert.deepEqual(findMemoLines("abc", ""), []);
});

test("findMemoLines: 長い行は見つかった所が見えるように前後を切る", () => {
  const line = `${"x".repeat(300)}needle${"y".repeat(300)}`;
  const [hit] = findMemoLines(line, "needle");
  assert.ok(hit.text.startsWith("…") && hit.text.endsWith("…"));
  assert.equal(hit.text.slice(hit.match_start, hit.match_end), "needle");
});

test("searchMemoTexts: メモ（.md・.html）だけを読み、プロジェクトとパスを添える", async () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, "sub"));
  fs.writeFileSync(path.join(dir, "a.md"), "りんご\nバナナ\n");
  fs.writeFileSync(path.join(dir, "sub", "b.html"), "<p>バナナ</p>\n");
  fs.writeFileSync(path.join(dir, "c.txt"), "バナナ\n");
  const result = await searchMemoTexts([{ projectId: 7, dir, files: ["a.md", "sub", "sub/b.html", "c.txt"] }], " バナナ ");
  assert.deepEqual(result.hits.map((h) => [h.project_id, h.path, h.line]), [[7, "a.md", 2], [7, "sub/b.html", 1]]);
  assert.equal(result.truncated, false);
  assert.deepEqual((await searchMemoTexts([{ projectId: 7, dir, files: ["a.md"] }], "  ")).hits, []);
});
