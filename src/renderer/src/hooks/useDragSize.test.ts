import assert from "node:assert/strict";
import { test } from "node:test";
import { draggedSize } from "./useDragSize";

test("draggedSize: つまみが右・下の端（end）なら、右・下へ動かすほど大きく", () => {
  assert.equal(draggedSize(300, 40, { edge: "end", min: 200, max: 480 }), 340);
  assert.equal(draggedSize(300, -40, { edge: "end", min: 200, max: 480 }), 260);
});

test("draggedSize: つまみが左・上の端（start）なら、左・上へ動かすほど大きく", () => {
  // 右の欄の左端のつまみを左へ 50px
  assert.equal(draggedSize(400, -50, { edge: "start", min: 360, max: 900 }), 450);
  // 下の欄の上端のつまみを下へ 30px
  assert.equal(draggedSize(240, 30, { edge: "start", min: 120, max: 600 }), 210);
});

test("draggedSize: min〜max に収め、丸める。max が min より小さければ min", () => {
  assert.equal(draggedSize(300, 500, { edge: "end", min: 200, max: 480 }), 480);
  assert.equal(draggedSize(300, -500, { edge: "end", min: 200, max: 480 }), 200);
  assert.equal(draggedSize(40.4, 10.3, { edge: "end", min: 15, max: 85 }), 51);
  assert.equal(draggedSize(300, 10, { edge: "end", min: 200, max: 150 }), 200);
});
