import assert from "node:assert/strict";
import { test } from "vitest";
import { PR_STATE_LABELS, prStateOf } from "./prState";

test("prStateOf: マージ済み・閉じたは下書きでもその状態、開いていれば下書きかで分ける（大文字の gh の値も同じ）", () => {
  assert.equal(prStateOf("MERGED", true), "merged");
  assert.equal(prStateOf("closed", true), "closed");
  assert.equal(prStateOf("OPEN", true), "draft");
  assert.equal(prStateOf("open", false), "open");
  assert.deepEqual(["OPEN", "MERGED", "CLOSED"].map((s) => PR_STATE_LABELS[prStateOf(s, false)]), ["開いている", "マージ済み", "閉じた"]);
});
