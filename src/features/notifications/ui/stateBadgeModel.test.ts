import assert from "node:assert/strict";
import { test } from "vitest";
import { makeStateBadges } from "./stateBadgeModel";

test("色を CSS から直接そろえ、読めない色や半透明の色があっても件数は残す", () => {
  const snapshot = makeStateBadges({ running: 1, needs_input: 2, unread: 3 }, (css) => {
    if (css === "--dot-running") return " #65ACEE ";
    if (css === "--dot-needs-input") return "rgba(12, 128, 82, 0.75)";
    throw new Error("色を取れない");
  });
  assert.deepEqual(snapshot, {
    counts: { running: 1, needsInput: 2, unread: 3 },
    colors: { running: "#65acee", needsInput: null, unread: null },
  });
});

test("全件が 0 なら CSS を読まずに空の状態を作る", () => {
  const read: string[] = [];
  const snapshot = makeStateBadges({ running: 0, needs_input: 0, unread: 0 }, (name) => {
    read.push(name);
    return "#65acee";
  });
  assert.deepEqual(read, []);
  assert.deepEqual(snapshot, {
    counts: { running: 0, needsInput: 0, unread: 0 },
    colors: { running: null, needsInput: null, unread: null },
  });
});

test("三つの状態をそれぞれ同じ名前のテーマ色と IPC のキーに対応させる", () => {
  const css = new Map([["--dot-running", "#65acee"], ["--dot-needs-input", "#e4962f"], ["--dot-unread", "#45c66d"]]);
  assert.deepEqual(makeStateBadges({ running: 2, needs_input: 1, unread: 5 }, (name) => css.get(name) ?? ""), {
    counts: { running: 2, needsInput: 1, unread: 5 },
    colors: { running: "#65acee", needsInput: "#e4962f", unread: "#45c66d" },
  });
});
