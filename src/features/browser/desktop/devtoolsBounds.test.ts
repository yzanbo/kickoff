import assert from "node:assert/strict";
import { test } from "vitest";
import { viewBoundsOf } from "./devtoolsBounds";

test("開発者ツールの置き場所: 倍率を掛け、右下の端を丸めて幅と高さを決める", () => {
  assert.deepEqual(viewBoundsOf({ x: 10, y: 20, width: 300, height: 400 }, 1), { x: 10, y: 20, width: 300, height: 400 });
  // 端が半端なときも、隣（左の部品の右端 = 100.4 → 100）とすき間なく並ぶ
  assert.deepEqual(viewBoundsOf({ x: 100.4, y: 0.6, width: 200.2, height: 99.8 }, 1), { x: 100, y: 1, width: 201, height: 99 });
  assert.deepEqual(viewBoundsOf({ x: 10, y: 20, width: 300, height: 400 }, 1.25), { x: 13, y: 25, width: 375, height: 500 });
  assert.deepEqual(viewBoundsOf({ x: 10, y: 20, width: 0, height: 0 }, 1), { x: 10, y: 20, width: 0, height: 0 });
});
