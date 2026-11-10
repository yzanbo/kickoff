import assert from "node:assert/strict";
import { test } from "node:test";
import { fileTabKeyOf, fileTabOf, selectionOf } from "./fileTabs";

test("fileTabKeyOf: 中身はファイルごとに 1 つ（検索の行も同じタブ）、差分はステージ済み・未ステージごとに別のタブ", () => {
  assert.equal(fileTabKeyOf(3, { path: "src/a.ts" }), "pfile:3:src/a.ts");
  assert.equal(fileTabKeyOf(3, { path: "src/a.ts", line: 10 }), "pfile:3:src/a.ts");
  assert.equal(fileTabKeyOf(3, { path: "src/a.ts", staged: false, edit: true }), "pdiff:3:unstaged:src/a.ts");
  assert.equal(fileTabKeyOf(3, { path: "src/a.ts", staged: true }), "pdiff:3:staged:src/a.ts");
});

test("fileTabOf / selectionOf: タブにした選択はそのまま戻る（ない項目は持たない）", () => {
  for (const sel of [{ path: "a.ts" }, { path: "a.ts", line: 4 }, { path: "b/c.md", staged: true, edit: true, focus: true }, { path: "d.ts", staged: false }]) {
    assert.deepEqual(selectionOf(fileTabOf(1, sel)), sel);
  }
  assert.deepEqual(Object.keys(fileTabOf(1, { path: "a.ts" })).sort(), ["key", "kind", "path", "projectId"]);
});
