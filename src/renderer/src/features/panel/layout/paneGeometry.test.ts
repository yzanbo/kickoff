import assert from "node:assert/strict";
import { test } from "node:test";
import { dropZoneAt, insertIndexAt, layoutRects, resizeAt, splitOfZone } from "./paneGeometry";
import type { PaneNode } from "./paneLayout";

const leaf = (id: string): PaneNode => ({ type: "pane", id, tabs: [], active: null });

test("layoutRects: 左右・上下の入れ子から、ペインの位置と境目を求める", () => {
  const root: PaneNode = {
    type: "split",
    dir: "row",
    sizes: [0.5, 0.5],
    children: [leaf("a"), { type: "split", dir: "column", sizes: [0.25, 0.75], children: [leaf("b"), leaf("c")] }],
  };
  const { panes, sashes } = layoutRects(root);
  assert.deepEqual(panes, [
    { id: "a", rect: { x: 0, y: 0, w: 0.5, h: 1 } },
    { id: "b", rect: { x: 0.5, y: 0, w: 0.5, h: 0.25 } },
    { id: "c", rect: { x: 0.5, y: 0.25, w: 0.5, h: 0.75 } },
  ]);
  assert.deepEqual(sashes, [
    { path: [], index: 0, dir: "row", split: { x: 0, y: 0, w: 1, h: 1 }, at: 0.5 },
    { path: [1], index: 0, dir: "column", split: { x: 0.5, y: 0, w: 0.5, h: 1 }, at: 0.25 },
  ]);
  assert.deepEqual(layoutRects(leaf("a")), { panes: [{ id: "a", rect: { x: 0, y: 0, w: 1, h: 1 } }], sashes: [] });
});

test("dropZoneAt: 端から 1/4 以内ならいちばん近い端、真ん中はペインへ移す", () => {
  assert.equal(dropZoneAt(0.1, 0.5), "left");
  assert.equal(dropZoneAt(0.9, 0.5), "right");
  assert.equal(dropZoneAt(0.5, 0.1), "top");
  assert.equal(dropZoneAt(0.5, 0.95), "bottom");
  assert.equal(dropZoneAt(0.5, 0.5), "center");
  assert.equal(dropZoneAt(0.3, 0.7), "center");
  // 角は近いほうの端
  assert.equal(dropZoneAt(0.05, 0.2), "left");
  assert.equal(dropZoneAt(0.2, 0.05), "top");
});

test("splitOfZone: 端ごとの向きと側", () => {
  assert.deepEqual(splitOfZone("left"), { dir: "row", side: "before" });
  assert.deepEqual(splitOfZone("right"), { dir: "row", side: "after" });
  assert.deepEqual(splitOfZone("top"), { dir: "column", side: "before" });
  assert.deepEqual(splitOfZone("bottom"), { dir: "column", side: "after" });
  assert.equal(splitOfZone("center"), null);
});

test("resizeAt: 両隣の合計は変えず、小さくしすぎない", () => {
  assert.deepEqual(resizeAt([0.5, 0.5], 0, 0.3), [0.3, 0.7]);
  assert.deepEqual(resizeAt([0.5, 0.5], 0, 0), [0.08, 0.92]);
  const three = resizeAt([0.25, 0.25, 0.5], 1, 0.6);
  assert.equal(three[0], 0.25);
  assert.ok(Math.abs(three[1] - 0.35) < 1e-9 && Math.abs(three[2] - 0.4) < 1e-9);
  const end = resizeAt([0.25, 0.25, 0.5], 1, 1);
  assert.ok(Math.abs(end[1] - 0.67) < 1e-9 && Math.abs(end[2] - 0.08) < 1e-9);
});

test("insertIndexAt: タブの真ん中より左なら、そのタブの前", () => {
  const tabs = [
    { left: 0, width: 100 },
    { left: 100, width: 100 },
  ];
  assert.equal(insertIndexAt(10, tabs), 0);
  assert.equal(insertIndexAt(60, tabs), 1);
  assert.equal(insertIndexAt(160, tabs), 2);
  assert.equal(insertIndexAt(10, []), 0);
});
