import assert from "node:assert/strict";
import { test } from "vitest";
import { makeSnippet } from "@shared/foundation/testing/factories";
import { reduceSnippets } from "./snippets";
import { reduceBy } from "@/foundation/ui/store";

test("reduceSnippets: 作った・変えたものは並び順の位置へ、消した・消したプロジェクトのものは外す。関係なければ同じ一覧", () => {
  const list = [makeSnippet(1, { position: 0 }), makeSnippet(2, { position: 1, project_id: 5 })];
  assert.deepEqual(
    reduceBy(reduceSnippets, list, { type: "snippet", snippet: makeSnippet(3, { position: -1 }) }).map((s) => s.id),
    [3, 1, 2],
  );
  assert.deepEqual(
    reduceBy(reduceSnippets, list, { type: "snippet_deleted", id: 1 }).map((s) => s.id),
    [2],
  );
  assert.deepEqual(
    reduceBy(reduceSnippets, list, { type: "project_deleted", id: 5 }).map((s) => s.id),
    [1],
  );
  assert.equal(reduceBy(reduceSnippets, list, { type: "project_deleted", id: 9 }), list);
});
