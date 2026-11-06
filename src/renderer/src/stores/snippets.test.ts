import assert from "node:assert/strict";
import { test } from "node:test";
import type { Snippet } from "@shared/types";
import { reduceSnippets } from "./snippets";

const snippet = (id: number, position: number, project_id: number | null = null): Snippet => ({
  id,
  project_id,
  label: null,
  text: `t${id}`,
  position,
  created_at: "",
  updated_at: "",
});

test("reduceSnippets: 作った・変えたものは並び順の位置へ、消した・消したプロジェクトのものは外す。関係なければ同じ一覧", () => {
  const list = [snippet(1, 0), snippet(2, 1, 5)];
  assert.deepEqual(
    reduceSnippets(list, { type: "snippet", snippet: snippet(3, -1) }).map((s) => s.id),
    [3, 1, 2],
  );
  assert.deepEqual(
    reduceSnippets(list, { type: "snippet_deleted", id: 1 }).map((s) => s.id),
    [2],
  );
  assert.deepEqual(
    reduceSnippets(list, { type: "project_deleted", id: 5 }).map((s) => s.id),
    [1],
  );
  assert.equal(reduceSnippets(list, { type: "project_deleted", id: 9 }), list);
});
