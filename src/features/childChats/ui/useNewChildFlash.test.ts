import { test } from "vitest";
import assert from "node:assert/strict";
import { freshChildren } from "./useNewChildFlash";

const at = (iso: string) => new Date(iso).getTime();

test("freshChildren: 見始めた時刻より後に作られ、まだ光らせていない子だけを返す", () => {
  const children = [
    { id: 1, created_at: "2026-11-15T10:00:00.000Z" },
    { id: 2, created_at: "2026-11-15T10:00:20.000Z" },
    { id: 3, created_at: "2026-11-15T10:00:30.000Z" },
  ];
  assert.deepEqual(freshChildren(children, at("2026-11-15T10:00:10.000Z"), new Set()), [2, 3]);
  assert.deepEqual(freshChildren(children, at("2026-11-15T10:00:10.000Z"), new Set([3])), [2]);
});

test("freshChildren: 隠していた間に作られた子は、表に戻したときに光らせる（隠した時刻で比べる）", () => {
  const hiddenAt = at("2026-11-15T10:00:00.000Z");
  // 隠していた間に作られた子（表に戻したのは 5 分後）
  const children = [{ id: 7, created_at: "2026-11-15T10:03:00.000Z" }];
  assert.deepEqual(freshChildren(children, hiddenAt, new Set()), [7]);
  // 隠す前からある子は光らせない
  assert.deepEqual(freshChildren([{ id: 8, created_at: "2026-11-15T09:59:59.000Z" }], hiddenAt, new Set()), []);
});
