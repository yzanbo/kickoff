import assert from "node:assert/strict";
import { test } from "vitest";
import { dragAttrs } from "./dragAttrs";

test("dragAttrs: 入る位置も動かしている印もなければ、どの属性も付けない", () => {
  assert.deepEqual(dragAttrs(null), { "data-drop": undefined, "data-drop-axis": undefined, "data-drop-line": undefined, "data-drag-source": undefined });
  assert.deepEqual(dragAttrs(false, { axis: "x", line: "after" }), dragAttrs(undefined));
});

test("dragAttrs: 向きと線の置き場所は、入る位置があるときだけ付ける", () => {
  assert.deepEqual(dragAttrs("before", { axis: "x", line: "after" }), { "data-drop": "before", "data-drop-axis": "x", "data-drop-line": "after", "data-drag-source": undefined });
  assert.equal(dragAttrs("after", { axis: "y" })["data-drop-axis"], undefined);
});

test("dragAttrs: 動かしている物は data-drag-source を空の値で付ける", () => {
  assert.equal(dragAttrs(null, { source: true })["data-drag-source"], "");
});
