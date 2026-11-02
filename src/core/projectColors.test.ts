import assert from "node:assert/strict";
import { test } from "node:test";
import { PROJECT_HUES, pickProjectHue } from "./projectColors.js";
import { Store } from "./store.js";

test("プロジェクトの色: いちばん使われていない色の中で、使われている色からいちばん離れた色を選ぶ", () => {
  assert.equal(pickProjectHue([]), PROJECT_HUES[0]);
  // 赤（0）を使っていれば、いちばん離れた水色寄り（172）
  assert.equal(pickProjectHue([0]), 172);
  // 10 色すべてを使い切ったら、また 1 回ずつ使う
  const used = [...PROJECT_HUES];
  assert.ok((PROJECT_HUES as readonly number[]).includes(pickProjectHue(used)));
});

test("プロジェクトの色: 作るたびに、ほかと被らない色を覚える（10 個までは被らない）", () => {
  const store = new Store(":memory:");
  const hues = Array.from({ length: 10 }, (_, i) => store.createProject({ name: `p${i}`, repo_path: `/tmp/p${i}`, provider: "claude" }).hue);
  assert.equal(new Set(hues).size, 10);
  // 変えた色は覚える
  const first = store.listProjects().find((p) => p.name === "p0")!;
  assert.equal(store.updateProject(first.id, { hue: 262 }).hue, 262);
});
