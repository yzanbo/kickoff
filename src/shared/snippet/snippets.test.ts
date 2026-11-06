import { test } from "node:test";
import assert from "node:assert/strict";
import type { Snippet } from "@shared/types";
import { moveWithin, snippetLabel, snippetsFor } from "./snippets";

const snippet = (id: number, project_id: number | null, patch: Partial<Snippet> = {}): Snippet => ({
  id,
  project_id,
  label: null,
  text: `本文${id}`,
  position: id,
  created_at: "2026-11-06T00:00:00.000Z",
  updated_at: "2026-11-06T00:00:00.000Z",
  ...patch,
});

test("snippetLabel: 名前があれば名前、なければ本文の空でない最初の行を切って出す", () => {
  assert.equal(snippetLabel({ label: "確認", text: "長い本文" }), "確認");
  assert.equal(snippetLabel({ label: null, text: "\n  テストを流して\n2 行目" }), "テストを流して");
  assert.equal(snippetLabel({ label: null, text: "あ".repeat(30) }), `${"あ".repeat(24)}…`);
});

test("snippetsFor: 共通とそのプロジェクトのものだけを、並びを保って返す", () => {
  const list = [snippet(1, null), snippet(2, 5), snippet(3, 6), snippet(4, null)];
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
