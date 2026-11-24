import assert from "node:assert/strict";
import { test } from "vitest";
import { pickProjectHue } from "./colors";
import { PROJECT_HUES } from "@shared/foundation/hues";

test("プロジェクトの色: いちばん使われていない色の中で、使われている色からいちばん離れた色を選ぶ", () => {
  assert.equal(pickProjectHue([]), PROJECT_HUES[0]);
  // 赤（0）を使っていれば、いちばん離れた水色寄り（172）
  assert.equal(pickProjectHue([0]), 172);
  // 10 色すべてを使い切ったら、また 1 回ずつ使う
  const used = [...PROJECT_HUES];
  assert.ok((PROJECT_HUES as readonly number[]).includes(pickProjectHue(used)));
});
