import assert from "node:assert/strict";
import { test } from "vitest";
import { readToggleOf, showsReadButton } from "./readTiming";

test("readToggleOf: 作業が終わったチャットだけを切り替え、作業中・回答待ちは切り替えない", () => {
  assert.equal(readToggleOf("unread"), "seen");
  // 見るまで未読の失敗も、既読にする
  assert.equal(readToggleOf("failed"), "seen");
  assert.equal(readToggleOf("read"), "unseen");
  assert.equal(readToggleOf("running"), null);
  assert.equal(readToggleOf("needs_input"), null);
});

test("showsReadButton: ボタンで既読にする設定で、一番下まで来て、作業が終わって未読のときだけ出す", () => {
  assert.equal(showsReadButton("button", "unread", true), true);
  assert.equal(showsReadButton("button", "failed", true), true);
  // 上を読んでいる間は「一番下へ」のまま
  assert.equal(showsReadButton("button", "unread", false), false);
  // 既読・作業中・回答待ちは出さない
  for (const state of ["read", "running", "needs_input"] as const) assert.equal(showsReadButton("button", state, true), false);
  // 一番下まで見たら既読にする設定では出さない（自動で既読にする）
  assert.equal(showsReadButton("at_bottom", "unread", true), false);
});
