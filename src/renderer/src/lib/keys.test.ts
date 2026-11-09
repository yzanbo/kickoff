import assert from "node:assert/strict";
import { test } from "node:test";
import { hasAppModifier, hasModifiers, heldMetaOf, isCancelKey, isComposing, isFocusRingKey, isKey, isOpenKey, isRenameKey, isSubmitKey, type KeyInput } from "./keys";

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

test("isComposing: 変換中の印（React の nativeEvent・DOM の isComposing・keyCode 229）のどれかがあれば変換中", () => {
  assert.equal(isComposing(key("Enter")), false);
  assert.equal(isComposing(key("Enter", { nativeEvent: { isComposing: true } })), true);
  assert.equal(isComposing(key("Enter", { isComposing: true })), true);
  // 変換を確定する Enter で isComposing を立てない環境
  assert.equal(isComposing(key("Enter", { keyCode: 229, nativeEvent: { isComposing: false } })), true);
});

test("isSubmitKey: Enter と ⌘Enter は送る。Shift+Enter（改行）と変換を確定する Enter は送らない", () => {
  assert.equal(isSubmitKey(key("Enter")), true);
  assert.equal(isSubmitKey(key("Enter", { metaKey: true })), true);
  assert.equal(isSubmitKey(key("Enter", { shiftKey: true })), false);
  assert.equal(isSubmitKey(key("Enter", { keyCode: 229 })), false);
  assert.equal(isSubmitKey(key("a")), false);
});

test("isCancelKey: 修飾キーのない Esc だけ（変換をやめる Esc は除く）", () => {
  assert.equal(isCancelKey(key("Escape")), true);
  assert.equal(isCancelKey(key("Escape", { shiftKey: true })), false);
  assert.equal(isCancelKey(key("Escape", { isComposing: true })), false);
});

test("isRenameKey / isOpenKey: 名前の変更は修飾キーのない Enter（変換を確定する Enter は除く）、開くのは修飾キーのない Space", () => {
  assert.equal(isRenameKey(key("Enter")), true);
  assert.equal(isRenameKey(key("Enter", { metaKey: true })), false);
  assert.equal(isRenameKey(key("Enter", { shiftKey: true })), false);
  assert.equal(isRenameKey(key("Enter", { keyCode: 229 })), false);
  assert.equal(isOpenKey(key(" ")), true);
  assert.equal(isOpenKey(key(" ", { shiftKey: true })), false);
  assert.equal(isOpenKey(key("Enter")), false);
});

test("isKey: 修飾キーはちょうど合うものだけ。1 文字のキーは大文字・小文字を区別しない", () => {
  assert.equal(isKey(key("ArrowDown", { metaKey: true }), "ArrowDown", { meta: true }), true);
  assert.equal(isKey(key("ArrowDown", { metaKey: true, altKey: true }), "ArrowDown", { meta: true }), false);
  assert.equal(isKey(key("R", { ctrlKey: true }), "r", { ctrl: true }), true);
  assert.equal(isKey(key("r", { ctrlKey: true, shiftKey: true }), "r", { ctrl: true }), false);
  assert.equal(hasModifiers(key("x")), true);
});

test("heldMetaOf: ⌘ だけ・⌘⇧ を見分け、⌘ を押していない・Ctrl / Option も押しているときは null", () => {
  assert.equal(heldMetaOf(key("Meta", { metaKey: true })), "meta");
  assert.equal(heldMetaOf(key("Shift", { metaKey: true, shiftKey: true })), "meta-shift");
  assert.equal(heldMetaOf(key("Shift", { shiftKey: true })), null);
  assert.equal(heldMetaOf(key("Meta", { metaKey: true, altKey: true })), null);
});

test("hasAppModifier: Mac は ⌘ だけ（⌃K などの Control は入力欄の編集に残す）、ほかは Ctrl だけ", () => {
  assert.equal(hasAppModifier(key("k", { metaKey: true }), true), true);
  assert.equal(hasAppModifier(key("k", { ctrlKey: true }), true), false);
  assert.equal(hasAppModifier(key("k", { metaKey: true, ctrlKey: true }), true), false);
  assert.equal(hasAppModifier(key("k", { ctrlKey: true }), false), true);
  assert.equal(hasAppModifier(key("k", { metaKey: true }), false), false);
});

test("isFocusRingKey: 修飾キーだけ・⌘ / ⌃ / ⌥ のショートカットではピントの枠を出さず、Tab・矢印・文字（Shift 付きも）では出す", () => {
  for (const k of ["Shift", "Meta", "Control", "Alt", "CapsLock"]) assert.equal(isFocusRingKey(key(k, { shiftKey: k === "Shift", metaKey: k === "Meta", ctrlKey: k === "Control", altKey: k === "Alt" })), false, k);
  assert.equal(isFocusRingKey(key("k", { metaKey: true })), false);
  assert.equal(isFocusRingKey(key("Tab", { ctrlKey: true })), false);
  assert.equal(isFocusRingKey(key("ArrowDown", { altKey: true })), false);
  assert.equal(isFocusRingKey(key("Tab")), true);
  assert.equal(isFocusRingKey(key("Tab", { shiftKey: true })), true);
  assert.equal(isFocusRingKey(key("ArrowDown")), true);
  assert.equal(isFocusRingKey(key("A", { shiftKey: true })), true);
});
