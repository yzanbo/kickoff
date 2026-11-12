import assert from "node:assert/strict";
import { test } from "node:test";
import { isTargetLine, targetLabel } from "./reviewLines";

test("コメントを付けた行の見分け: RIGHT は変更後の行番号、LEFT は消した行の変更前の行番号", () => {
  assert.equal(isTargetLine({ type: "add", text: "", newNo: 5 }, { line: 5, side: "RIGHT" }), true);
  assert.equal(isTargetLine({ type: "context", text: "", oldNo: 5, newNo: 6 }, { line: 5, side: "LEFT" }), false);
  assert.equal(isTargetLine({ type: "del", text: "", oldNo: 5 }, { line: 5, side: "LEFT" }), true);
  assert.equal(isTargetLine({ type: "del", text: "", oldNo: 5 }, { line: 5, side: "RIGHT" }), false);
});

test("行の呼び名: 範囲・変更前の側", () => {
  assert.equal(targetLabel({ line: 12, side: "RIGHT", start_line: null }), "12 行目");
  assert.equal(targetLabel({ line: 12, side: "RIGHT", start_line: 10 }), "10〜12 行目");
  assert.equal(targetLabel({ line: 3, side: "LEFT", start_line: 3 }), "変更前の 3 行目");
});
