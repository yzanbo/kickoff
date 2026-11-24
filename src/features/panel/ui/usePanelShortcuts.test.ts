import assert from "node:assert/strict";
import { test } from "vitest";
import { shouldClosePanelOnEsc, type EscContext } from "./usePanelShortcuts";

const esc = { key: "Escape", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
const base: EscContext = { rule: true, key: "kanban:1", focusedKey: "kanban:1", nestedFocus: false, dialogOpen: false };

test("Esc で閉じる欄は、Esc で閉じる（ほかのキー・閉じない欄では閉じない）", () => {
  assert.equal(shouldClosePanelOnEsc(esc, base), true);
  assert.equal(shouldClosePanelOnEsc({ ...esc, key: "Enter" }, base), false);
  assert.equal(shouldClosePanelOnEsc(esc, { ...base, rule: false }), false);
});

test("日本語入力の変換をやめる Esc・ダイアログやメニューが開いているときは閉じない", () => {
  assert.equal(shouldClosePanelOnEsc({ ...esc, isComposing: true }, base), false);
  assert.equal(shouldClosePanelOnEsc({ ...esc, keyCode: 229 }, base), false);
  assert.equal(shouldClosePanelOnEsc(esc, { ...base, dialogOpen: true }), false);
});

test("ピントが中の入れ子の欄（チャットの中の右の欄）にあれば、外の欄は閉じない", () => {
  assert.equal(shouldClosePanelOnEsc(esc, { ...base, focusedKey: "agents:7", nestedFocus: true }), false);
  // ピントがどの欄にもなくても、Esc で閉じる欄は閉じる
  assert.equal(shouldClosePanelOnEsc(esc, { ...base, focusedKey: undefined }), true);
});

test("focused の欄（チャットの右の欄）は、ピントが中にあるときだけ閉じる（外のチャットで押した Esc では閉じない）", () => {
  const side: EscContext = { ...base, rule: "focused", key: "agents:7" };
  assert.equal(shouldClosePanelOnEsc(esc, { ...side, focusedKey: "agents:7" }), true);
  assert.equal(shouldClosePanelOnEsc(esc, { ...side, focusedKey: "kanban:1" }), false);
  assert.equal(shouldClosePanelOnEsc(esc, { ...side, focusedKey: undefined }), false);
});
