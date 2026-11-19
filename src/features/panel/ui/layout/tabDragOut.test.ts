import assert from "node:assert/strict";
import { test } from "vitest";
import { endedOutsideWindow } from "./tabDragOut";

test("endedOutsideWindow: どこも受け取らずにウィンドウの外で離したときだけ", () => {
  const view = { width: 1200, height: 800 };
  assert.equal(endedOutsideWindow({ clientX: 1300, clientY: 200, dropEffect: "none" }, view), true);
  assert.equal(endedOutsideWindow({ clientX: -5, clientY: 200, dropEffect: "none" }, view), true);
  assert.equal(endedOutsideWindow({ clientX: 300, clientY: 800, dropEffect: "none" }, view), true);
  // ウィンドウの中（落とし先のない所・Esc でやめた）
  assert.equal(endedOutsideWindow({ clientX: 300, clientY: 200, dropEffect: "none" }, view), false);
  // 受け取られた（ほかのペイン・タブの列に落とした）
  assert.equal(endedOutsideWindow({ clientX: 1300, clientY: 200, dropEffect: "move" }, view), false);
});
