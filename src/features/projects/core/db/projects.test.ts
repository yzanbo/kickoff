import assert from "node:assert/strict";
import { test } from "vitest";
import { testStore } from "@/app/core/testing/testStore";

test("プロジェクトの色: 作るたびに、ほかと被らない色を覚える（10 個までは被らない）", () => {
  const store = testStore();
  const hues = Array.from({ length: 10 }, (_, i) => store.projects.create({ name: `p${i}`, repo_path: `/tmp/p${i}`, provider: "claude" }).hue);
  assert.equal(new Set(hues).size, 10);
  // 変えた色は覚える
  const first = store.projects.list().find((p) => p.name === "p0")!;
  assert.equal(store.projects.update(first.id, { hue: 262 }).hue, 262);
});
