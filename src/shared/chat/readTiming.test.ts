import assert from "node:assert/strict";
import { test } from "vitest";
import { readToggleOf } from "./readTiming";

test("readToggleOf: 作業が終わったチャットだけを切り替え、作業中・回答待ちは切り替えない", () => {
  assert.equal(readToggleOf("unread"), "seen");
  // 見るまで未読の失敗も、既読にする
  assert.equal(readToggleOf("failed"), "seen");
  assert.equal(readToggleOf("read"), "unseen");
  assert.equal(readToggleOf("running"), null);
  assert.equal(readToggleOf("needs_input"), null);
});
