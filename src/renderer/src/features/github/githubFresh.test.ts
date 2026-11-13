import assert from "node:assert/strict";
import { test } from "node:test";
import type { GitHubItem } from "@shared/types";
import { makePullDetail } from "@shared/testing/factories";
import { freshItemNumbers } from "./githubFresh";

const item = (number: number, updated_at: string): GitHubItem => ({ ...makePullDetail().item, number, updated_at });

test("新しくなった行: 前の一覧がなければ（初めて・絞り込みを変えた）何も返さない", () => {
  assert.deepEqual(freshItemNumbers(null, [item(1, "2026-11-13T01:00:00Z")]), []);
});

test("新しくなった行: 更新の時刻が変わったものと、前のいちばん新しい更新より後に更新された新しい行", () => {
  const prev = [item(1, "2026-11-13T01:00:00Z"), item(2, "2026-11-12T00:00:00Z")];
  const next = [item(3, "2026-11-13T02:00:00Z"), item(1, "2026-11-13T01:30:00Z"), item(2, "2026-11-12T00:00:00Z")];
  assert.deepEqual(freshItemNumbers(prev, next), [3, 1]);
});

test("新しくなった行: 絞り込みの外から入ってきただけの古い行は含めない", () => {
  const prev = [item(1, "2026-11-13T01:00:00Z")];
  assert.deepEqual(freshItemNumbers(prev, [item(1, "2026-11-13T01:00:00Z"), item(9, "2026-11-01T00:00:00Z")]), []);
});

test("新しくなった行: 前の一覧が空なら、新しい行は数えない", () => {
  assert.deepEqual(freshItemNumbers([], [item(1, "2026-11-13T01:00:00Z")]), []);
});
