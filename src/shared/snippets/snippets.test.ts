import { test } from "vitest";
import assert from "node:assert/strict";
import { makeSnippet } from "@shared/snippets/testing";
import { moveWithin, snippetLabel, snippetsFor } from "./snippets";

test("snippetLabel: 名前があれば名前、なければ本文の空でない最初の行を切って出す", () => {
  assert.equal(snippetLabel({ label: "確認", text: "長い本文" }), "確認");
  assert.equal(snippetLabel({ label: null, text: "\n  テストを流して\n2 行目" }), "テストを流して");
  assert.equal(snippetLabel({ label: null, text: "あ".repeat(30) }), `${"あ".repeat(24)}…`);
});

test("snippetsFor: 共通とそのプロジェクトのものだけを、並びを保って返す", () => {
  const list = [makeSnippet(1), makeSnippet(2, { project_id: 5 }), makeSnippet(3, { project_id: 6 }), makeSnippet(4)];
  assert.deepEqual(
    snippetsFor(list, 5).map((s) => s.id),
    [1, 2, 4],
  );
});

test("moveWithin: 見えている中で隣と入れ替え、見えていないものの位置は変えない", () => {
  // 3 は見えていない（ほかのプロジェクトだけのもの）
  assert.deepEqual(moveWithin([1, 2, 3, 4], [1, 2, 4], 4, -1), [1, 4, 3, 2]);
  assert.deepEqual(moveWithin([1, 2, 3, 4], [1, 2, 4], 1, 1), [2, 1, 3, 4]);
  assert.equal(moveWithin([1, 2, 3], [1, 2, 3], 1, -1), null);
  assert.equal(moveWithin([1, 2, 3], [1, 2, 3], 9, 1), null);
});
