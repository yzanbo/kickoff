import assert from "node:assert/strict";
import { test } from "vitest";
import { browserKeyCode, isBrowserFindKey } from "./keys.js";

test("ブラウザの検索は ⌘F（Mac 以外は Ctrl+F）だけを受け取る", () => {
  const cmdF = { type: "keyDown", key: "f", meta: true, control: false, shift: false, alt: false, isComposing: false };
  const ctrlF = { ...cmdF, meta: false, control: true };
  assert.equal(isBrowserFindKey(cmdF, true), true);
  assert.equal(isBrowserFindKey(ctrlF, false), true);
  assert.equal(isBrowserFindKey(ctrlF, true), false);
  assert.equal(isBrowserFindKey(cmdF, false), false);
  for (const other of [
    { type: "keyUp" }, { key: "g" }, { meta: false }, { control: true }, { shift: true }, { alt: true }, { isComposing: true },
  ]) {
    assert.equal(isBrowserFindKey({ ...cmdF, ...other }, true), false);
  }
});

test("browserKeyCode: Web のキーの名前を Electron の名前にし、大文字・小文字を問わない。1 文字と知らない名前はそのまま", () => {
  assert.equal(browserKeyCode("ArrowDown"), "Down");
  assert.equal(browserKeyCode("enter"), "Enter");
  assert.equal(browserKeyCode("Return"), "Enter");
  assert.equal(browserKeyCode("esc"), "Escape");
  assert.equal(browserKeyCode("pagedown"), "PageDown");
  assert.equal(browserKeyCode(" "), "Space");
  assert.equal(browserKeyCode("a"), "a");
  assert.equal(browserKeyCode("F5"), "F5");
});
